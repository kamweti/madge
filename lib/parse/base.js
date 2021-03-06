'use strict';

/**
 * Module dependencies
 */
var fs = require('fs'),
	path = require('path'),
	util = require('util'),
	EventEmitter = require('events').EventEmitter,
	commondir = require('commondir'),
	finder = require('walkdir'),
	coffee = require('coffee-script'),
	jsx = require('react-tools');

/**
 * Traversing `src` and fetches all dependencies.
 * @constructor
 * @param {Array} src
 * @param {Object} opts
 * @param {Object} parent
 */
var Base = module.exports = function(src, opts, parent) {
	if (opts.onParseFile) {
		this.on('parseFile', opts.onParseFile.bind(parent));
	}

	if (opts.onAddModule) {
		this.on('addModule', opts.onAddModule.bind(parent));
	}

   	opts.isFile = opts.isFile || function (file) {
        try { 
        	var stat = fs.statSync(file) 
        } catch (err) { 
        	if (err && err.code === 'ENOENT') 
        		return false 
       	}
        return stat.isFile() || stat.isFIFO();
    };

	this.opts = opts;
	this.tree = {};
	this.extRegEx = /\.(js|coffee|jsx)$/;
	this.coffeeExtRegEx = /\.coffee$/;
	this.jsxExtRegEx = /\.jsx$/;
	src = this.resolveTargets(src);
	this.excludeRegex = opts.exclude ? new RegExp(opts.exclude) : false;
	this.baseDir = this.getBaseDir(src);
	this.readFiles(src);
	this.sortDependencies();
};

util.inherits(Base, EventEmitter);

/**
 * Resolve the given `id` to a filename.
 * @param  {String} dir
 * @param  {String} id
 * @return {String}
 */
Base.prototype.resolve = function (dir, id) {
	try {
	    var readFileSync = this.opts.readFileSync || fs.readFileSync;

	    this.opts.paths = this.opts.paths || [];

	    if (/^([A-Za-z\/])+/.test(id)) {
	        var res = this.loadAsFileSync(path.resolve(dir, id));
	        if (res) {
	        	return res;
	        }
	    }
	    
	    throw new Error("Cannot find module '" + id + "' from '" + dir + "'");

	} catch (e) {
		if (this.opts.breakOnError) {
			console.log(String('\nError while resolving module from: ' + id).red);
			throw e;
		}
		return id;
	}
};



/**
 * Get the most common dir from the `src`.
 * @param  {Array} src
 * @return {String}
 */
Base.prototype.getBaseDir = function (src) {
	var dir = commondir(src);

	if (!fs.statSync(dir).isDirectory()) {
		dir = path.dirname(dir);
	}
	return dir;
};

/**
 * Resolves all paths in `sources` and ensure we have a absolute path.
 * @param  {Array} sources
 * @return {Array}
 */
Base.prototype.resolveTargets = function (sources) {
	return sources.map(function (src) {
		return path.resolve(src);
	});
};

/**
 * Normalize a module file path and return a proper identificator.
 * @param  {String} filename
 * @return {String}
 */
Base.prototype.normalize = function (filename) {
	return this.replaceBackslashInPath(path.relative(this.baseDir, filename).replace(this.extRegEx, ''));
};

/**
 * Check if module should be excluded.
 * @param  {String}
 * @return {Boolean}
 */
Base.prototype.isExcluded = function (id) {
	return this.excludeRegex && id.match(this.excludeRegex);
};

/**
 * Parse the given `filename` and add it to the module tree.
 * @param {String} filename
 */
Base.prototype.addModule = function (basedir, filename) {
	var id = this.normalize(filename);

	if (!this.isExcluded(id) && fs.existsSync(filename)) {
		this.tree[id] = this.parseFile(basedir, filename);
		this.emit("addModule", {id: id, dependencies: this.tree[id]});
	}
};

/**
 * Traverse `sources` and parse files found.
 * @param  {Array} sources
 */
Base.prototype.readFiles = function (sources) {
	sources.forEach(function (src) {
		if (fs.statSync(src).isDirectory()) {
			finder.sync(src).filter(function (filename) {
				return filename.match(this.extRegEx);
			}, this).forEach(function (filename) {
				this.addModule(src, filename);
			}, this);
		} else {
			this.addModule(path.dirname(src), src);
		}
	}, this);
};

/**
 * Read the given filename and compile it if necessary and return the content.
 * @param  {String} filename
 * @return {String}
 */
Base.prototype.getFileSource = function (filename) {
	var src = fs.readFileSync(filename, 'utf8');

	if (filename.match(this.coffeeExtRegEx)) {
		src = coffee.compile(src, {
			header: false,
			bare: true
		});
	} else if (filename.match(this.jsxExtRegEx)) {
		src = jsx.transform( src );
	}

	return src;
};

/**
 * Sort dependencies by name.
 */
Base.prototype.sortDependencies = function () {
	var self = this;

	this.tree = Object.keys(this.tree).sort().reduce(function (acc, id) {
		(acc[id] = self.tree[id]).sort();
		return acc;
	}, {});
};

/**
 * Replace back slashes in path (Windows) with forward slashes (*nix).
 * @param  {String} path
 * @return {String}
 */
Base.prototype.replaceBackslashInPath = function (path) {
	return path.replace(/\\/g, '/');
};

/**
 * Borrowed from https://github.com/substack/node-resolve/blob/master/lib/sync.js
 *
 * Check if a file exists
 * @return {String}
 */
Base.prototype.loadAsFileSync = function(file) {
    if (this.opts.isFile(file)) {
        return file;
    }
	
	var extensions = this.opts.extensions || [ '.js' ];   
    for (var i = 0; i < extensions.length; i++) {
        var file = file + extensions[i];
        if (this.opts.isFile(file)) {
            return file;
        }
    }
}
'use strict';

/**
 * Module dependencies.
 */
var fs = require('fs'),
	path = require('path'),
	util = require('util'),
	detective = require('detective'),
	colors = require('colors'),
	Base = require('./base');

/**
 * This class will parse the CommonJS module format.
 * @see http://nodejs.org/api/modules.html
 * @constructor
 */
var CJS = module.exports = function () {
	Base.apply(this, arguments);
};

/**
 * Inherit from `Base`.
 */
util.inherits(CJS, Base);

/**
 * Normalize a module file path and return a proper identificator.
 * @param  {String} filename
 * @return {String}
 */
CJS.prototype.normalize = function (filename) {
	filename = this.replaceBackslashInPath(filename);
	if (filename.charAt(0) !== '/' && !filename.match(/^[a-z]:\//i)) {
		// a core module (not mapped to a file)
		return filename;
	}
	return Base.prototype.normalize.apply(this, arguments);
};

/**
 * Parse the given file and return all found dependencies.
 * @param  {String} filename
 * @return {Array}
 */
CJS.prototype.parseFile = function (base, filename) {
	try {
		if (fs.existsSync(filename)) {
			var dependencies = [],
				src = this.getFileSource(filename);

			this.emit('parseFile', {filename: filename, src: src});

			if (/require\s*\(/m.test(src)) {

				// is this dependency defined withing this file?
				var re = /(?:module\.exports\s*?=\s*)([A-Z]+[a-z]+)/g,
					match,
					modules_defined_in_src = [];

				while ((match = re.exec(src)) != null) {
				    modules_defined_in_src.push(match[1]);
				}

				detective(src).map(function (id) {

					var is_module_defined_in_source = modules_defined_in_src.map(
						function(str){
							return str.toLowerCase();
						})
						.indexOf(id.toLowerCase()) != -1;

					if (!is_module_defined_in_source) {
						var depFilename = this.resolve(base, id);
						if (depFilename) {
							return this.normalize(depFilename);
						}
					}

				}, this).filter(function (id) {
					if (!this.isExcluded(id) && dependencies.indexOf(id) < 0) {
						dependencies.push(id);
					}
				}, this);

				return dependencies;
			}
		}
	} catch (e) {
		if (this.opts.breakOnError) {
			console.log(String('\nError while parsing file: ' + filename).red);
			throw e;
		}
	}

	return [];
};
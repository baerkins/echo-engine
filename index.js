const _ = require('lodash');
const Handlebars = require('handlebars');
const Matter = require('gray-matter');
const Inflect = require('i');
const JSYaml = require('js-yaml');
const Markdown = require('markdown-it')({ html: true, linkify: true });
const mkdirp = require('mkdirp');
const Globby = require('globby');

// Node
const Path = require('path');
const fs = require('fs');
const util = require('util');

/**
 * Defaults
 *
 */
const echoDefaults = {
  // default layout
  layout: "default",

  // Directory where partials live
  partialsDir: "src/partials/",

  // common entries
  common: "common/**/*",

  // blocks
  blocks: "blocks/**/*",

  // partial includes,
  partialLib: "lib/**/*",

  // How to delimit subcollections in ids
  idDelimiter: "__",

  // Layouts Directory
  layouts: ["src/views/layouts/*"],

  // Echo Guide Includes
  guideIncludes: ["src/views/guide/echo/*"],

  // Echo Guide Pages
  guidePages: ["src/views/guide/**/*", "!src/views/guide/echo/**"],

  // Pages
  pages: ["src/views/pages/*"],

  // Yaml Data
  data: ["src/data/*"],

  // Views - do not include layouts or pages
  views: ["src/views/**/*", "!src/views/+(layouts)/**"],

  // Build Path
  dist: "./dist",

  keys: {
    views: {
      guides: 'guides',
      echo: 'echo',
      pages: 'pages'
    }
  }
};

// Merged Options
let echoOpts = {};


/**
 * Data Stuff
 *
 */
let echoData = {
  partials      : {}, // All registered partials
  layouts       : {}, // Layouts
  guidePages    : {},
  pages         : {},
  data          : {}
};





////////// FUNCTIONS ///////////


/**
 * Get the name of a file (minus extension) from a path
 * @param  {String} filePath
 * @example
 * './src/materials/structures/foo.html' -> 'foo'
 * './src/materials/structures/02-bar.html' -> 'bar'
 * @return {String}
 *
 */
const getName = function (filePath, preserveNumbers) {
  // get name; replace spaces with dashes
  let name = Path.basename(filePath, Path.extname(filePath)).replace(/\s/g, '-');
  return (preserveNumbers) ? name : name.replace(/^[0-9|\.\-]+/, '');
};


/**
 * Convert a file name to title case
 * @param  {String} str
 * @return {String}
 */
var toTitleCase = function (str) {
  return str.replace(/(\-|_)/g, ' ').replace(/\w\S*/g, function (word) {
    return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
  });
};






////////// PARSE STUFF //////////


/**
 * Parse all partials.
 * Add each to data object, register each as Handlbars partial
 *
 */
const parsePartials = () => {

  // Make sure data is clear
  echoData.partials = {};

  const allPartials = [
    Path.normalize(echoOpts.partialsDir + echoOpts.common),
    Path.normalize(echoOpts.partialsDir + echoOpts.blocks),
    Path.normalize(echoOpts.partialsDir + echoOpts.partialLib)
  ];

  // Get all files that should be made into partials
  const files = Globby.sync(allPartials, {nodir: true, nosort: true});

  files.forEach(function (file) {

    // Get filepath values
    const filepath = Path.normalize(Path.dirname(file)).replace(echoOpts.partialsDir, '').split(Path.sep);
    const stubs    = filepath.slice(1);

    // Top most folder or false
    let collection = stubs.length > 1 ? stubs.slice(-2, -1)[0] : stubs[0];
    collection = collection === undefined ? false : collection;

    // Child folder or false
    let subCollection = collection ? stubs.pop() : false;
    subCollection = subCollection === collection ? false : subCollection;

    // Name of Partial
    const name = Path.basename(file, Path.extname(file));
    const id = subCollection ? subCollection + echoOpts.idDelimiter + name : name;

    // get info
    var fileMatter = Matter.read(file);

    // trim whitespace from material content
    var content = fileMatter.content.replace(/^(\s*(\r?\n|\r))+|(\s*(\r?\n|\r))+$/g, '');

    // get local file data in front matter
    var localData = _.omit(fileMatter.data, 'notes');

    /**
     * THIS REPLACE INVLOVES POINTING TO AN ID
     notes: (fileMatter.data.notes) ? md.render(fileMatter.data.notes) : '', LOOK HERE!!
     *
     */
    // replace local fields on the fly with name-spaced keys
    // this allows partials to use local front-matter data
    // only affects the compilation environment
    if (!_.isEmpty(localData)) {
      _.forEach(localData, function (val, key) {
        // {{field}} => {{material-name.field}}
        var regex = new RegExp('(\\{\\{[#\/]?)(\\s?' + key + '+?\\s?)(\\}\\})', 'g');
        content = content.replace(regex, function (match, p1, p2, p3) {
          return p1 + id.replace(/\./g, '-') + '.' + p2.replace(/\s/g, '') + p3;
        });
      });
    }

    /**
     * Store partial in the echoData object
     *
     */
    let parent = filepath[0];
    let dataPath = parent;
    let partialData = {
      partialID: id,
      html: content,
      notes: fileMatter.data.notes ? Markdown.render(fileMatter.data.notes) : '',
    };

    // Add echoData.partials object key with file base value
    if (!_.has(echoData.partials, parent)) {
      echoData.partials[parent] = {};
    }

    if (collection) {
      dataPath += '.' + collection;
    }

    if (subCollection) {
      dataPath += '.' + subCollection;
    }

    dataPath += '.' + name;

    // Add partial to echoData.partials
    _.set(echoData.partials, dataPath, partialData);

    // register the partial
    Handlebars.registerPartial(id, content);

  });

  // console.log(util.inspect(echoData.partials, { showHidden: false, depth: null }))

}




/**
 * Parse Layouts
 */
const parseLayouts = () => {

  // reset
  echoData.layouts = {};

  // get files
  var files = Globby.sync(echoOpts.layouts, { nodir: true });

  // save content of each file
  files.forEach(function (file) {
    var id = getName(file);
    var content = fs.readFileSync(file, 'utf-8');
    echoData.layouts[id] = content;
  });

  // console.log('Layouts: ');
  // console.log(echoData.layouts);

};


/**
 * Register layout includes has Handlebars partials
 */
var parseGuideIncludes = function () {

  // get files
  var files = Globby.sync(echoOpts.guideIncludes, { nodir: true });

  // save content of each file
  files.forEach(function (file) {
    var id = getName(file);
    var content = fs.readFileSync(file, 'utf-8');
    Handlebars.registerPartial(id, content);
  });

};

/**
 * Register layout includes has Handlebars partials
 */
var parseGuideFiles = function () {

  echoData.guidePages = {};

  // get files
  var files = Globby.sync(echoOpts.guidePages, { nodir: true });

  files.forEach(function (file) {
    var id = getName(file);

    console.log(Path.normalize(Path.dirname(file)));

    // determine if view is part of a collection (subdir)
    var dirname = Path.normalize(Path.dirname(file)).split(Path.sep).pop();
      collection = (dirname !== echoOpts.keys.views.guide) ? dirname : '';
      // collection = '';

    var fileMatter = Matter(file),
      fileData = _.omit(fileMatter.data, 'notes');

    // if this file is part of a collection
    if (collection) {

      // create collection if it doesn't exist
      echoData.guidePages[collection] = echoData.guidePages[collection] || {
        name: toTitleCase(collection),
        items: {}
      };

      // store view data
      echoData.guidePages[collection].items[id] = {
        name: toTitleCase(id),
        data: fileData
      };

    }
  });

  console.log(util.inspect(echoData.guidePages, {
      showHidden: false,
      depth: null
    }));

};


/**
 * Parse data files and save JSON
 */
var parseData = function () {

  // reset
  echoData.data = {};

  // get files
  var files = Globby.sync(echoOpts.data, { nodir: true });

  // save content of each file
  files.forEach(function (file) {
    var id = getName(file);
    var content = JSYaml.safeLoad(fs.readFileSync(file, 'utf-8'));
    echoData.data[id] = content;
  });

};













/**
 * Kick off the data parade
 *
 */
const setup = userOptions => {
        // merge user options with defaults
        echoOpts = _.merge({}, echoDefaults, userOptions);

        parsePartials(); // Register Partials
        parseGuideIncludes(); // Register Guide Partials
        parseLayouts();
        parseData();
        parseGuideFiles();

        // setup steps

        // parseViews();
        // parseDocs();
      };;


/**
 * Build Echo
 *
 */
const buildEcho = () => {
  // console.log('hi');

  mkdirp.sync(echoOpts.dist);

}


/**
 * Handle Errors
 *
 */
var handleError = function (e) {

  // default to exiting process on error
  var exit = true;

  // construct error object by combining argument with defaults
  var error = _.assign({}, {
    name: 'Error',
    reason: '',
    message: 'An error occurred',
  }, e);

  console.error('ECHO ERROR: ' + e.message + '\n', e.stack);

}


/**
 * Module exports
 *
 */
module.exports = function (options) {

  try {

    // setup assembly
    setup(options);

    // assemble
    buildEcho();

  } catch (e) {
    handleError(e);
  }

};


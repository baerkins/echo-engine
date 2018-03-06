const _ = require('lodash');
const Handlebars = require('handlebars');
const Matter = require('gray-matter');
const Inflect = require('i');
const JSYaml = require('js-yaml');
const Markdown = require('markdown-it');
const Mkdirp = require('mkdirp');
const Globby = require('globby');
const GUtil = require('gulp-util');
const Path = require('path');
const fs = require('fs');


/**
 * Defaults
 * 
 */
const echoDefaults = {

  // default layout
  layout: 'default',

  // Directory where partials live
  partialsDir: 'src/partials/',

  // common entries
  common: 'common/**/*',

  // blocks
  blocks: 'blocks/**/*',

  // helpers
  helpers: 'helpers/**/*',

};

// Merged Options
let echoOpts = {};


/** 
 * Data Stuff
 * 
 */
let echoData = {

  // All registered partials
  partials: {},

  // All common entries
  commons: {},

  // All block entries
  blocks: {},

  // Add data
  data: {},

  // All layouts
  layouts: {},

  // All pages
  pages: {}

};





////////// FUNCTIONS ///////////


/**
 * Get the name of a file (minus extension) from a path
 * @param  {String} filePath
 * @example
 * './src/materials/structures/foo.html' -> 'foo'
 * './src/materials/structures/02-bar.html' -> 'bar'
 * @return {String}
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
 * Register Partials
 * 
 */
const registerPartials = () => {

  // Make sure data is clear
  echoData.partials = {};

  const allPartials = [
    Path.normalize(echoOpts.partialsDir + echoOpts.common), 
    Path.normalize(echoOpts.partialsDir + echoOpts.blocks), 
    Path.normalize(echoOpts.partialsDir + echoOpts.helpers)
  ];

  // Get all files that should be made into partials
  const files = Globby.sync(allPartials, {nodir: true, nosort: true});


  files.forEach(function (file) {
    
    
    let stubs = Path.normalize(Path.dirname(file)).replace(echoOpts.partialsDir, '').split(Path.sep).slice(1);
    
    let parent = stubs.length > 1 ? stubs.slice(-2, -1)[0] : stubs[0];
    parent = parent === undefined ? false : parent;
    
    let collection = parent ? stubs.pop() : false;
    collection = collection === parent ? false : collection;

    let id = collection ? collection + '__' + Path.basename(file, Path.extname(file)) : Path.basename(file, Path.extname(file));
    
    // console.log(file + ':');
    // console.log('parent:     ' + parent);
    // console.log('collection: ' + collection);
    // console.log('id:         ' + id);


    // get info
    var fileMatter = Matter.read(file);

    // trim whitespace from material content
    var content = fileMatter.content.replace(/^(\s*(\r?\n|\r))+|(\s*(\r?\n|\r))+$/g, '');
    
    // get local file data in front matter
    var localData = _.omit(fileMatter.data, 'notes');


    /**
     * THIS REPLACE INVLOVES POINTING TO AN ID
     * IF PARTIALS ARE A PROBLEM, LOOK HERE!!
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



    // register the partial
    Handlebars.registerPartial(id, content);

    console.log('----------');
  });
  

  
    

  // });
  

}












/**
 * Kick off the data parade
 * 
 */
const setup = (userOptions) => {

  // merge user options with defaults
  echoOpts = _.merge({}, echoDefaults, userOptions);

  registerPartials(); // Register Partials

  // setup steps
  // registerHelpers();
  // parseLayouts();
  // parseLayoutIncludes();
  // parseData();
  // parseMaterials();
  // parseViews();
  // parseDocs();

};


/**
 * Build Echo
 * 
 */
const buildEcho = () => {
  // console.log('hi');
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


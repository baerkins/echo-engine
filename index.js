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


/**
 * Defaults
 * 
 */
const echoDefaults = {

  // default layout
  layout: 'default',

  // common entries
  common: 'src/partials/common/**/*',

  // blocks
  blocks: 'src/partials/blocks/**/*',

  // helpers
  helpers: 'src/partials/helpers/**/*',

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

  const allPartials = [echoOpts.common, echoOpts.blocks, echoOpts.helpers];

  // Get all files that should be made into partials
  const files = Globby.sync(allPartials, {nodir: true, nosort: true});

  // build a glob for identifying directories
  const dirsGlob = allPartials.map(function (pattern) {
    return Path.dirname(pattern) + '/*/';
  });

  // get all directories
  // do a new glob; trailing slash matches only dirs
  var dirs = Globby.sync(dirsGlob).map(function (dir) {
    return Path.normalize(dir).split(Path.sep).slice(-2, -1)[0];
  });

  // Find and store all working directories
  let workingDirs = [];

  allPartials.forEach( (dir) => {
    let dirArr = dir.split(Path.sep);

    dirArr.forEach( (dirName) => {
      if ( dirName == '\*' || dirName == '\*\*' || dirName == '') {
        return;
      } else {
        workingDirs.push(dirName);
      }
    });
  });
  
  workingDirs = _.uniq(workingDirs);

  console.log(workingDirs);

  let fileIDPath;

  // console.log(dirs);

  console.log('Files:');
  console.log('----------');

  // stub out an object for each collection and subCollection
  files.forEach(function (file) {

    var parent = getName(Path.normalize(Path.dirname(file)).split(Path.sep).slice(-2, -1)[0], true);
    var collection = getName(Path.normalize(Path.dirname(file)).split(Path.sep).pop(), true);
    var isSubCollection = (dirs.indexOf(parent) > -1);

    // get the material base dir for stubbing out the base object for each category (e.g. component, structure)
    var materialBase = (isSubCollection) ? parent : collection;

    // stub the base object
    echoData.partials[materialBase] = echoData.partials[materialBase] || {
      name: toTitleCase(getName(materialBase)),
      items: {}
    };

    if (isSubCollection) {
      echoData.partials[parent].items[collection] = echoData.partials[parent].items[collection] || {
        name: toTitleCase(getName(collection)),
        items: {}
      };
    }

    // let type = getName(Path.normalize(Path.dirname(file)).split(Path.sep).slice(-2, -1)[0], true);
    // var collection = getName(Path.normalize(Path.dirname(file)).split(Path.sep).pop(), true);
    // var isSubCollection = (dirs.indexOf(parent) > -1);

    // const splitPath = Path.normalize(Path.dirname(file)).split(Path.sep);
    // const idPath = _.difference(splitPath, workingDirs);

    // console.log(type);
    // console.log(collection);
    // console.log(workingDirs);
    // console.log(splitPath);
    // console.log(idPath);
    // console.log(file);
    // console.log('--');

    // // get the material base dir for stubbing out the base object for each category (e.g. component, structure)
    // var materialBase = (isSubCollection) ? parent : collection;

    // // stub the base object
    // assembly.materials[materialBase] = assembly.materials[materialBase] || {
    //   name: toTitleCase(getName(materialBase)),
    //   items: {}
    // };

    // if (isSubCollection) {
    //   assembly.materials[parent].items[collection] = assembly.materials[parent].items[collection] || {
    //     name: toTitleCase(getName(collection)),
    //     items: {}
    //   };
    // }

  });

  console.log(echoData.partials);

  
  // iterate over each file (material)
  files.forEach(function (file) {

    // get info
    // var fileMatter = Matter(file);
    // var collection = getName(Path.normalize(Path.dirname(file)).split(Path.sep).pop(), true);
    // var parent = Path.normalize(Path.dirname(file)).split(Path.sep).slice(-2, -1)[0];
    // var isSubCollection = (dirs.indexOf(parent) > -1);
    // var id = (isSubCollection) ? getName(collection) + '.' + getName(file) : getName(file);
    // var key = (isSubCollection) ? collection + '.' + getName(file, true) : getName(file, true);

    // // get material front-matter, omit `notes`
    // var localData = _.omit(fileMatter.data, 'notes');

    // // trim whitespace from material content
    // var content = fileMatter.content.replace(/^(\s*(\r?\n|\r))+|(\s*(\r?\n|\r))+$/g, '');


    // capture meta data for the material
    // if (!isSubCollection) {
    //   echoData.partials[collection].items[key] = {
    //     name: toTitleCase(id),
    //     notes: (fileMatter.data.notes) ? md.render(fileMatter.data.notes) : '',
    //     data: localData
    //   };
    // } else {
    //   echoData.partials[parent].items[collection].items[key] = {
    //     name: toTitleCase(id.split('.')[1]),
    //     notes: (fileMatter.data.notes) ? md.render(fileMatter.data.notes) : '',
    //     data: localData
    //   };
    // }


    // store material-name-spaced local data in template context
    // assembly.materialData[id.replace(/\./g, '-')] = localData;


    // replace local fields on the fly with name-spaced keys
    // this allows partials to use local front-matter data
    // only affects the compilation environment
    // if (!_.isEmpty(localData)) {
    //   _.forEach(localData, function (val, key) {
    //     // {{field}} => {{material-name.field}}
    //     var regex = new RegExp('(\\{\\{[#\/]?)(\\s?' + key + '+?\\s?)(\\}\\})', 'g');
    //     content = content.replace(regex, function (match, p1, p2, p3) {
    //       return p1 + id.replace(/\./g, '-') + '.' + p2.replace(/\s/g, '') + p3;
    //     });
    //   });
    // }

    // register the partial
    // Handlebars.registerPartial(id, content);

  });
  

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


const _ = require('lodash');
const Handlebars = require('handlebars');
const Matter = require('gray-matter');
const Inflect = require('i');
const JSYaml = require('js-yaml');
const Markdown = require('markdown-it')({ html: true, linkify: true });
const mkdirp = require('mkdirp');
const Globby = require('globby');
const Beautify = require('beautify');
const Pretty = require('pretty');
const SortObj = require('sort-object');
const DeepSortObj = require('deep-sort-object');

// Node
const Path = require('path');
const fs = require('fs');
const util = require('util');





//
// Add Assemble.io helpers to Handlebars
// http://assemble.io/helpers/
//
const AssembleHelpers = require('handlebars-helpers')({
  handlebars: Handlebars
});





//
// Default options
//
const echoDefaults = {

  // Directory where partials live
  partialsDir: "src/partials/",

  // common entries
  common: "common/**/*",

  // modules
  modules: "modules/**/*",

  // partial includes,
  partialLib: "lib/**/*",

  // How to delimit subcollections in ids
  idDelimiter: "__",

  // Layouts Directory
  layouts: ["src/views/layouts/*"],

  // default layout
  defaultLayout: "default",

  // default module layout
  defaultModuleLayout: "default-module",

  // path to index file
  index: "src/index.html",

  // Echo Guide Includes
  guideIncludes: ["src/views/guide/echo/*"],

  // Echo Guide Pages
  guidepages: ["src/views/guide/**/*", "!src/views/guide/echo/**"],

  // Pages
  pages: ["src/views/pages/**/*"],

  // Yaml Data
  data: ["src/data/*"],

  // Views - do not include layouts or pages
  views: ["src/views/**/*", "!src/views/+(layouts)/**"],

  // Build Path
  dist: "./dist",

  // guide slug path
  guideBaseSlug: "guide/",

  // beautifier options
	prettyOpts: {
		ocd: true
	},

  keys: {
    partials: {
      common: 'common',
      modules: 'modules',
      lib: 'lib',
      modulesDestPath: 'modules'
    },
    views: {
      guides: 'guide',
      echo: 'echo',
      pages: 'pages'
    },
    echo: {
      collection: 'collection',
      subcollection: 'subcollection',
      parent: 'parent'
    }
  }
};





// Merged Options
let echoOpts = {};





//
// Master data object
//
let echoData = {
  partials      : {}, // All registered partials
  layouts       : {}, // Layouts
  guidepages    : {},
  pages         : {},
  sitedata      : {},
  partialData   : {}
};





////////// FUNCTIONS ///////////





/**
 * Get the name of a file (minus extension) from a path
 * @param  {String} filePath
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


/**
 * Turn string into a url ready slug
 * @param {String} text
 * @return {String}
 */
const slugify = (text) => {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

/**
 * Insert the page into a layout
 * @param  {String} page
 * @param  {String} layout
 * @return {String}
 */
const wrapPage = function (page, layout) {
	return layout.replace(/\{\%\s?body\s?\%\}/, page);
};





/**
 * Build the template context by merging context-specific data with assembly data
 * @param  {Object} data
 * @return {Object}
 */
const buildContext = function (data, hash) {

	// set keys to whatever is defined
	var partialItems = {};
  partialItems[echoOpts.keys.common] = echoData.partials.common;
  partialItems[echoOpts.keys.modules] = echoData.partials.modules;
  partialItems[echoOpts.keys.lib] = echoData.partials.lib;

	var views = {};
  views[echoOpts.keys.views.guides] = echoData.guidepages;
  views[echoOpts.keys.views.pages] = echoData.pages;

	// var docs = {};
	// docs[options.keys.docs] = assembly.docs;

  return _.assign({}, data, echoData, echoData.data, hash);

};





/**
 *
 * Build HTML file
 *
 * @param {string} path The path where the file should be written
 * @param {object} data Minimum data Model:
 *
 * data : {
 *   name: *string* ,
 *   data: {
 *     *json* front matter data, may or may not include layout
 *   },
 *   html: *string* html content
 *
 * }
 *
 */
const buildHTML = (path, data, skipLayout) => {

  // Setup localData for Handlebars context, setup layout definition.
  let localData = {};
  let layout = echoData.layouts[echoOpts.defaultLayout];
  let content;

  // Partial type
  if ( _.has(data, 'partialType')) {
    localData.partialType = data.partialType;
  }

  // Nicename
  if ( _.has(data, 'name')) { localData.name = data.name; }
  if ( _.has(data, 'id')) { localData.id = data.id; }
  if ( _.has(data, 'slug')) { localData.slug = data.slug; }
  if ( _.has(data, 'spec')) { localData.spec = data.spec; }
  if ( _.has(data, 'notes')) { localData.notes = data.notes; }

  // Front Matter
  if ( _.has(data, 'data') & !_.isEmpty(data.data)) {
    Object.entries(data.data).forEach(([key, val]) => {

      localData[key] = val;

      // Override template based on localdata
      if (key === 'layout') {
        layout = echoData.layouts[val];
      }
    });
  }

  // Use default block partial
  if ( data.partialType === echoOpts.keys.partials.modules) {
    content = echoData.layouts[echoOpts.defaultModuleLayout];
  } else {
    let wrapSelf = typeof skipLayout !== 'undefined' ? skipLayout : false;
    content  = wrapSelf ? data.html : wrapPage(data.html, layout);
  }

  // Build content, compile with Handlebars
  const context  = buildContext(localData),
        template = Handlebars.compile(content);

  // Write the file
  fs.writeFileSync(path, Pretty(template(context), echoOpts.prettyOpts));


}





/**
 * Replace localdata (front matter) values in content
 * @param {object} matter front matter object
 * @param {string} content content
 */
const replaceMatter = (matter, content) => {

  Object.entries(matter).forEach(([val, key]) => {
    var regex = new RegExp('(\\{\\{[#\/]?)(\\s?' + val + '+?\\s?)(\\}\\})', 'g');
    content = content.replace(regex, key);
  });

  return content;

}





//
// Register Handlebars Helpers
//
const registerHelpers = () => {

  // Print as json
  Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context, null, 2);
  });

  // Get URL parameter
  Handlebars.registerHelper('getURLparam', function(param) {
    if (!url) url = window.location.href;
    param = param.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + param + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  });


  // Output Handlebar-ed content
  Handlebars.registerHelper('itemcontent', function (id, context) {

		// attempt to find pre-compiled partial
		const template = Handlebars.partials[id];

		// compile partial if not already compiled
		const content = !_.isFunction(template) ? Handlebars.compile(template) : template;

    // return beautified html with trailing whitespace removed
		return Pretty(content(context).replace(/^\s+/, ''), echoOpts.prettyOpts);

  });



  Handlebars.registerHelper('guideLink', function (slug) {
    const file = fs.readFileSync('src/data/global.yml', 'utf-8');

    if (file) {
      const yml = JSYaml.safeLoad(file);
      if (yml.baseurl) {
        const slashSlug = slug.startsWith('/') ? slug : '/' + slug;
        return yml.baseurl + slashSlug;
      }
    }
    return slug.startsWith('/') ? slug : '/' + slug;
  });
}





////////// PARSE STUFF //////////





//
// Parse all partials.
// Add each to data object, register each as Handlbars partial
//
const parsePartials = () => {

  // Make sure data is clear
  echoData.partials = {};

  const allPartials = [
    Path.normalize(echoOpts.partialsDir + echoOpts.common),
    Path.normalize(echoOpts.partialsDir + echoOpts.modules),
    Path.normalize(echoOpts.partialsDir + echoOpts.partialLib)
  ];


  // Get all files that should be made into partials
  const files = Globby.sync(allPartials, {nodir: true, nosort: true});

  files.forEach(function (file) {

    // Get filepath values
    const filepath = Path.normalize(Path.dirname(file)).replace(echoOpts.partialsDir, '').split(Path.sep);
    const stubs    = filepath.slice(1);
    const parent   = filepath[0];

    // Top most folder or false
    let collection = stubs.length > 1 ? stubs.slice(-2, -1)[0] : stubs[0];
    collection = collection === undefined ? false : collection;

    // Child folder or false
    let subCollection = collection ? stubs.pop() : false;
    subCollection = subCollection === collection ? false : subCollection;

    // Name of Partial
    const name = Path.basename(file, Path.extname(file));
    const partialID = subCollection ? subCollection + echoOpts.idDelimiter + name : name;
    const id = name;

    // Set slug for modules
    let partialSlug;

    if ( parent === echoOpts.keys.partials.modules) {
      partialSlug  = parent + Path.sep;
      partialSlug += collection ? slugify(collection) + Path.sep : '';
      partialSlug += subCollection ? slugify(subCollection) + Path.sep : '';
      partialSlug += slugify(name);
      partialSlug += '.html';
    } else {
      partialSlug = collection || subCollection ? slugify(collection) + '.html' + '#' + slugify(name) : slugify(name) + '.html';
    }

    // get info
    const fileMatter = Matter.read(file);

    // trim whitespace from material content
    let content = fileMatter.content.replace(/^(\s*(\r?\n|\r))+|(\s*(\r?\n|\r))+$/g, '');

    // // get local file data in front matter
    const localData = _.omit(fileMatter.data, 'notes');


    if (!_.isEmpty(localData)) {
      content = replaceMatter(localData, content);
    }

    // register the partial
    Handlebars.registerPartial(partialID, content);

    // Lib partials have been registered, so ok to bail
    if (parent === echoOpts.keys.partials.lib) {
      return false;
    }

    //
    //  Store partial in the echoData object
    //
    let fileData = _.omit(fileMatter.data, ['notes', 'spec']);
    let partialData = {
      id: partialID,
      partialType: parent,
      name: toTitleCase(name),
      notes: fileMatter.data.notes ? Markdown.render(fileMatter.data.notes) : '',
      spec: fileMatter.data.spec ? fileMatter.data.spec : '',
      data: fileData,
      slug: partialSlug,
      type: 'partial',
    };

    // Add html to module objects
    if (parent === echoOpts.keys.partials.modules) {
      partialData.html = content;
      partialData.addSlash = true;
    }

    // Add echoData.partials object key with file base value
    if (!_.has(echoData.partials, parent)) {
      echoData.partials[parent] = {
        type: echoOpts.keys.echo.parent,
        name: toTitleCase(parent),
        id: slugify(parent),
        items: {}
      };
    }

    // Add collection to parent partials object if it does not yet exist
    if (collection) {
      if (!_.has(echoData.partials[parent].items, collection)) {
        echoData.partials[parent].items[collection] = {
          type: echoOpts.keys.echo.collection,
          name: toTitleCase(collection),
          id: slugify(collection),
          slug: slugify(collection) + '.html',
          items: {}
        };
      }
    }

    // Add subcollection to parent collection partials object if it does not yet exist
    if (subCollection) {
      if (!_.has(echoData.partials[parent].items[collection].items, subCollection)) {
        echoData.partials[parent].items[collection].items[subCollection] = {
          type: echoOpts.keys.echo.subcollection,
          name: toTitleCase(subCollection),
          id: slugify(subCollection),
          slug: slugify(collection) + '.html#' + slugify(subCollection),
          items: {}
        };
      }

      echoData.partials[parent].items[collection].items[subCollection].items[id] = partialData;

      return;

    }

    if (collection) {
      echoData.partials[parent].items[collection].items[id] = partialData;

      return;
    }


    echoData.partials[parent].items[id] = partialData;

    return;

  });

  // Sort Partials
  echoData.partials = DeepSortObj(echoData.partials);

  // Sort Modules - Single before collections
  let currentMods = echoData.partials[echoOpts.keys.partials.modules].items;
  let modsSort = {};
  for ( let key in currentMods ) {
    if (currentMods[key].partialType === 'modules') {
      modsSort[key] = currentMods[key];
      delete currentMods[key];
    }
  }
  for ( let key in currentMods ) {
    modsSort[key] = currentMods[key];
  }

  echoData.partials[echoOpts.keys.partials.modules].items = modsSort;

}





//
// Parse Layouts
//
const parseLayouts = () => {

  // reset
  echoData.layouts = {};

  // get files
  const files = Globby.sync(echoOpts.layouts, { nodir: true });

  // save content of each file
  files.forEach(function (file) {
    var id = getName(file);
    var content = fs.readFileSync(file, 'utf-8');
    echoData.layouts[id] = content;
  });


};





//
// Register layout includes has Handlebars partials
//
const parseGuideIncludes = () => {

  // get files
  var files = Globby.sync(echoOpts.guideIncludes, { nodir: true });

  // save content of each file
  files.forEach(function (file) {
    var id = getName(file);
    var content = fs.readFileSync(file, 'utf-8');
    Handlebars.registerPartial(id, content);
  });

};





//
// Register layout includes has Handlebars partials
//
const parseGuidePages = () => {

  echoData.guidepages = {};

  // get files
  const files = Globby.sync(echoOpts.guidepages, { nodir: true });

  files.forEach(function (file) {

    const id = slugify(getName(file));

    // determine if view is part of a collection (subdir)
    // const dirname = Path.normalize(Path.dirname(file)).split(Path.sep).pop();

    const fileMatter = Matter.read(file);
    const fileData = _.omit(fileMatter.data, 'notes');

    // trim whitespace from material content
    let content = fileMatter.content.replace(/^(\s*(\r?\n|\r))+|(\s*(\r?\n|\r))+$/g, '');

    // // get local file data in front matter
    const localData = fileMatter;

    if (!_.isEmpty(localData)) {
      content = replaceMatter(localData, content);
    }

    // store view data
    echoData.guidepages[id] = {
      name: toTitleCase(id),
      notes: fileMatter.data.notes ? Markdown.render(fileMatter.data.notes) : '',
      data: fileData,
      slug: id + '.html',
      html: content
    };

  });


};





//
// Register layout includes has Handlebars partials
//
const parsePages = () => {

  echoData.pages = {};

  const pageKey = echoOpts.keys.views.pages;

  echoData.pages[pageKey] = {
    name: toTitleCase(pageKey),
    slug: slugify(pageKey),
    items: {}
  };

  // get files
  var files = Globby.sync(echoOpts.pages, { nodir: true });

  files.forEach(function (file) {

    const id         = getName(file),
          dirname    = Path.normalize(Path.dirname(file)).split(Path.sep).pop(),
          collection = (dirname !== echoOpts.keys.views.pages) ? dirname : '',
          fileMatter = Matter.read(file),
          fileData   = _.omit(fileMatter.data, 'notes'),
          content    = fileMatter.content;

    // if this file is part of a collection
    if (collection) {

      // create collection if it doesn't exist
      echoData.pages[collection] = echoData.pages[collection] || {
        name: toTitleCase(collection),
        items: {}
      };

      // store view data
      echoData.pages[collection].items[id] = {
        name: toTitleCase(id),
        data: fileData,
        html: content,
        slug: slugify(pageKey) + Path.sep + slugify(collection) + Path.sep + slugify(id) + '.html',
      };

    } else {
      echoData.pages[pageKey].items[id] = {
        name: toTitleCase(id),
        data: fileData,
        html: content,
        slug: slugify(pageKey) + Path.sep + slugify(id) + '.html',
      };
    }
  });

};





//
// Parse data files from yaml and save JSON
//
var parseData = () => {

  // reset
  echoData.sitedata = {};

  // get files
  const files = Globby.sync(echoOpts.data, { nodir: true });

  // save content of each file
  files.forEach( file => {
    const id      = getName(file),
          content = JSYaml.safeLoad(fs.readFileSync(file, 'utf-8'));

    echoData.sitedata[id] = content;
  });

};





//
// Kick off the data parade
//
const parseEcho = userOptions => {

  // merge user options with defaults
  echoOpts = _.merge({}, echoDefaults, userOptions);

  registerHelpers();
  parseLayouts();
  parseGuideIncludes();
  parseData();
  parsePartials();
  parseGuidePages();
  parsePages();

};





//
// Build Pages
//
const buildPages = () => {

  Object.entries(echoData.pages).forEach(([page, data]) => {
    const stubPath = echoOpts.dist + Path.sep + data.slug;
    mkdirp.sync(stubPath);

    Object.entries(data.items).forEach(([page, data]) => {
      buildHTML(stubPath + Path.sep + page + '.html', data);
    });
  });

}





//
// Build Guide Pages
//
const buildGuidePages = () => {

  Object.entries(echoData.guidepages).forEach(([key, file]) => {
    buildHTML(echoOpts.dist + Path.sep + key + '.html', file);
  });

};





//
// Build Modules
//
const buildGuideModules = () => {

  Object.entries(echoData.partials.modules.items).forEach(([page, data]) => {

    const basePath = echoOpts.keys.partials.modulesDestPath;
    let stubPath = echoOpts.dist + Path.sep + basePath;
    mkdirp.sync(stubPath);

    if (data.type === 'partial') {
      buildHTML(stubPath + Path.sep + page + '.html', data);
      return;
    }

    if (data.type === 'collection') {
      stubPath += Path.sep + data.id;
      mkdirp.sync(stubPath);

      Object.entries(data.items).forEach(([page, data]) => {
        if (data.type === 'subcollection') {
          stubPath += Path.sep + data.id;
          mkdirp.sync(stubPath);

          Object.entries(data.items).forEach(([page, data]) => {
            // Partial
            buildHTML(stubPath + Path.sep + page + '.html', data);

          });
        } else {
          // Partial
          buildHTML(stubPath + Path.sep + page + '.html', data);
        }
      })
    }

  });
};





//
// Build Index Page
//
const buildIndex = () => {
  const indexPath = Path.normalize(process.cwd() + Path.sep + echoOpts.index);
  const fileMatter = Matter.read(indexPath);
  const name = fileMatter.title ? fileMatter.title : 'Home';

  const data = {
    name: name,
    data: fileMatter.data,
    html: fileMatter.content
  }

  buildHTML(echoOpts.dist + Path.sep + 'index.html', data, true);

}





//
// Build Echo html files
//
const buildEcho = () => {
  mkdirp.sync(echoOpts.dist);
  buildPages();
  buildGuidePages();
  buildGuideModules();
  buildIndex();

  // Write JSON into file for reference
  const jsonDir = echoOpts.dist + Path.sep + 'json';
  mkdirp.sync(jsonDir);

  fs.writeFile(jsonDir + '/echoData.json', JSON.stringify(echoData, null, 2), 'utf8', () => {});
}





//
// Handle Errors
//
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





//
// Module export
//
module.exports = function (options) {

  try {

    // Build context, parse files
    parseEcho(options);

    // Build out files
    buildEcho();

  } catch (e) {
    handleError(e);
  }

};
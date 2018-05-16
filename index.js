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

  defaultLayout: "default",

  defaultGuideLayout: "default",

  defaultBlocksLayout: "default-block",

  // Echo Guide Includes
  guideIncludes: ["src/views/guide/echo/*"],

  // Echo Guide Pages
  guidePages: ["src/views/guide/**/*", "!src/views/guide/echo/**"],

  // Pages
  pages: ["src/views/pages/**/*"],

  // Yaml Data
  data: ["src/data/*"],

  // Views - do not include layouts or pages
  views: ["src/views/**/*", "!src/views/+(layouts)/**"],

  // Build Path
  dist: "./dist",

  keys: {
    partials: {
      common: 'common',
      blocks: 'blocks',
      lib: 'lib',
      blocksDestPath: 'blocks'
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


/**
 * Data Stuff
 *
 */
let echoData = {
  partials      : {}, // All registered partials
  layouts       : {}, // Layouts
  guidePages    : {},
  pages         : {},
  sitedata      : {},
  partialData   : {}
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



const registerHelpers = () => {

  // Print as json
  Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context, null, 2);
  });

  Handlebars.registerHelper('encodeURL', function(string) {
    return encodeURIComponent(string);
  });

  Handlebars.registerHelper('decodeURL', function(string) {
    return decodeURIComponent(string);
  });

  Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
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
}




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
  partialItems[echoOpts.keys.blocks] = echoData.partials.blocks;
  partialItems[echoOpts.keys.lib] = echoData.partials.lib;

	var views = {};
  views[echoOpts.keys.views.guides] = echoData.guidePages;
  views[echoOpts.keys.views.pages] = echoData.pages;

	// var docs = {};
	// docs[options.keys.docs] = assembly.docs;

  return _.assign({}, data, echoData, hash);

};

/**
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
const buildHTML = (path, data) => {

  // Setup localData for Handlebars context, setup layout definition.
  let localData = {};
  let layout = echoData.layouts[echoOpts.defaultGuideLayout];

  // Partial type
  if ( _.has(data, 'partialType')) {
    localData.partialType = data.partialType;

    // Use default block partial
    if ( data.partialType === echoOpts.keys.partials.blocks) {
      layout = echoOpts.defaultBlocksLayout;
    }
  }

  // Nicename
  if ( _.has(data, 'name')) {
    localData.name = data.name;
  }

  // Front Matter
  if ( _.has(data, 'data') & !_.isEmpty(data.data)) {
    Object.entries(data.data).forEach(([key, val]) => {
      localData[key] = val;

      if (val === 'layout') {
        layout = val;
      }
    });
  }

  // if ( _.has(data, 'slug')) {
  //   localData.slug = data.slug;
  // }

  // console.log(localData);

  const content       = wrapPage(data.html, layout),
        context       = buildContext(localData),
        template      = Handlebars.compile(content);

  fs.writeFileSync(path, Pretty(template(context), {ocd: true}));
}

const replaceMatter = (matter, content) => {

  Object.entries(matter).forEach(([val, key]) => {
    var regex = new RegExp('(\\{\\{[#\/]?)(\\s?' + val + '+?\\s?)(\\}\\})', 'g');
    content = content.replace(regex, key);
  });

  return content;

}





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

    // Set slug for blocks
    let partialSlug = false;
    if ( parent === echoOpts.keys.partials.blocks) {
      partialSlug = collection ? slugify(collection) + '/' : '';
      partialSlug += subCollection ? slugify(subCollection) + '/' : '';
      partialSlug += slugify(name);
    }

    // get info
    const fileMatter = Matter.read(file);

    // trim whitespace from material content
    let content = fileMatter.content.replace(/^(\s*(\r?\n|\r))+|(\s*(\r?\n|\r))+$/g, '');

    // // get local file data in front matter
    // const localData = _.omit(fileMatter.data, 'notes');

    // echoData.partialData[partialID] = localData;

    // if (!_.isEmpty(localData)) {
    //   content = replaceMatter(localData, content);
    // }

    // register the partial
    Handlebars.registerPartial(partialID, content);

    if (parent === echoOpts.keys.partials.lib) {
      return false;
    }

    /**
     * Store partial in the echoData object
     *
     */
    // let dataPath = parent;
    let fileData = _.omit(fileMatter.data, 'notes');
    let partialData = {
      id: id,
      partialID: partialID,
      partialType: parent,
      name: toTitleCase(name),
      html: content,
      notes: fileMatter.data.notes ? Markdown.render(fileMatter.data.notes) : '',
      data: fileData,
      slug: partialSlug
    };

    // Add echoData.partials object key with file base value
    if (!_.has(echoData.partials, parent)) {
      echoData.partials[parent] = {
        type: echoOpts.keys.echo.parent,
        name: toTitleCase(parent),
        id: slugify(parent),
        items: {}
      };
    }

    if (collection) {
      if (!_.has(echoData.partials[parent].items, collection)) {
        echoData.partials[parent].items[collection] = {
          type: echoOpts.keys.echo.collection,
          name: toTitleCase(collection),
          id: slugify(collection),
          items: {}
        };
      }
    }

    if (subCollection) {
      if (!_.has(echoData.partials[parent].items[collection].items, subCollection)) {
        echoData.partials[parent].items[collection].items[subCollection] = {
          type: echoOpts.keys.echo.subcollection,
          name: toTitleCase(subCollection),
          id: slugify(subCollection),
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


    // dataPath = partialData;

    // Add partial to echoData.partials
    // _.set(echoData.partials, dataPath, partialData);



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
  const files = Globby.sync(echoOpts.layouts, { nodir: true });

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

/**
 * Register layout includes has Handlebars partials
 */
const parseGuideFiles = () => {

  echoData.guidePages = {};

  // get files
  const files = Globby.sync(echoOpts.guidePages, { nodir: true });

  files.forEach(function (file) {
    const id = slugify(getName(file));
    const content = fs.readFileSync(file, 'utf-8');

    // console.log(Path.normalize(Path.dirname(file)));

    // determine if view is part of a collection (subdir)
    const dirname = Path.normalize(Path.dirname(file)).split(Path.sep).pop();
      collection = (dirname !== echoOpts.keys.views.guide) ? dirname : '';
      // collection = '';

    const fileMatter = Matter(file),
      fileData = _.omit(fileMatter.data, 'notes');

    // if this file is part of a collection
    if (collection) {

      // create collection if it doesn't exist
      echoData.guidePages[collection] = echoData.guidePages[collection] || {
        name: toTitleCase(collection),
        slug: slugify(collection),
        items: {}
      };

      // store view data
      echoData.guidePages[collection].items[id] = {
        name: toTitleCase(id),
        notes: fileMatter.data.notes ? Markdown.render(fileMatter.data.notes) : '',
        data: fileData,
        slug: id,
        html: content
      };

    }
  });

  // console.log(util.inspect(echoData.guidePages, {
  //     showHidden: false,
  //     depth: null
  //   }));

};

/**
 * Register layout includes has Handlebars partials
 */
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
    var id = getName(file);

    // determine if view is part of a collection (subdir)
    var dirname = Path.normalize(Path.dirname(file)).split(Path.sep).pop();
    collection = (dirname !== echoOpts.keys.views.pages) ? dirname : '';
    // collection = '';

    const fileMatter = Matter.read(file);
    const fileData = _.omit(fileMatter.data, 'notes');

    let content = fileMatter.content;

    // if (!_.isEmpty(fileData)) {
    //   content = replaceMatter(fileData, content);
    // }


    // if this file is part of a collection
    if (collection) {

      // create collection if it doesn't exist
      echoData.pages[collection] = echoData.pages[collection] || {
        name: toTitleCase(collection),
        slug: slugify(pageKey) + '/' + slugify(collection),
        items: {}
      };

      // store view data
      echoData.pages[collection].items[id] = {
        name: toTitleCase(id),
        data: fileData,
        html: content
      };

    } else {
      echoData.pages[pageKey].items[id] = {
        name: toTitleCase(id),
        data: fileData,
        html: content
      };
    }
  });

  // console.log(util.inspect(echoData.pages, {
  //   showHidden: false,
  //   depth: null
  // }));

};


/**
 * Parse data files and save JSON
 */
var parseData = () => {

  // reset
  echoData.sitedata = {};

  // get files
  var files = Globby.sync(echoOpts.data, { nodir: true });

  // save content of each file
  files.forEach( file => {
    var id = getName(file);
    var content = JSYaml.safeLoad(fs.readFileSync(file, 'utf-8'));
    echoData.sitedata[id] = content;
  });

};













/**
 * Kick off the data parade
 *
 */
const setup = userOptions => {
  // merge user options with defaults
  echoOpts = _.merge({}, echoDefaults, userOptions);

  registerHelpers();
  parsePartials(); // Register Partials
  parseGuideIncludes(); // Register Guide Partials
  parseLayouts();
  parseData();
  parseGuideFiles();
  parsePages();

  // setup steps

  // console.log(util.inspect(echoData, {
  //     showHidden: false,
  //     depth: null
  //   }));


  fs.writeFile('echoData.json', JSON.stringify(echoData, null, 2), 'utf8', () => {});
  // parseViews();
  // parseDocs();
};



// Build Pages
const buildPages = (baseDir) => {

  const pages         = echoData.pages,
        defaultLayout = echoData.layouts[echoOpts.defaultLayout];

  Object.entries(echoData.pages).forEach(([page, data]) => {
    // const pageSlug = data.slug === echoOpts.keys.views.pages ? '' : Path.sep + data.slug;
    const stubPath = echoOpts.dist + Path.sep + data.slug;
    mkdirp.sync(stubPath);

    Object.entries(data.items).forEach(([page, data]) => {
      buildHTML(stubPath + Path.sep + page + '.html', data);
    });
  });
}


// Build Pages
const buildGuidePages = () => {

  const defaultLayout = echoData.layouts[echoOpts.defaultGuideLayout];

  Object.entries(echoData.guidePages).forEach(([page, data]) => {

    const pageSlug = data.slug === echoOpts.keys.views.guides ? data.slug : echoOpts.keys.views.guides + Path.sep + data.slug;
    const stubPath = echoOpts.dist + Path.sep + pageSlug;
    mkdirp.sync(stubPath);

    Object.entries(data.items).forEach(([page, data]) => {
      buildHTML(stubPath + Path.sep + page + '.html', data);
    });
  });
};





// Build Pages
const buildGuideBlocks = () => {

  Object.entries(echoData.partials.blocks.items).forEach(([page, data]) => {

    const basePath = echoOpts.keys.views.guides + Path.sep + echoOpts.keys.partials.blocksDestPath;

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

const buildIndex = () => {
  const index = fs.readFileSync('./src/index.html', 'utf-8');
  const fileMatter = Matter.read('./src/index.html');
  const localData = _.omit(fileMatter.data, 'notes');

  let content    = wrapPage(fileMatter.content, echoData.layouts[echoOpts.defaultLayout]);

  if (!_.isEmpty(localData)) {
    content = replaceMatter(localData, content);
  }

  const template = Handlebars.compile(content);

  fs.writeFileSync(echoOpts.dist + Path.sep + 'index.html', Pretty(template(content), {ocd: true}));
}



/**
 * Build Echo
 *
 */
const buildEcho = () => {
  mkdirp.sync(echoOpts.dist);
  buildPages();
  buildGuidePages();
  buildGuideBlocks();
  buildIndex();
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


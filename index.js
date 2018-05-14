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

  guideLayout: "default",

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
  sitedata      : {}
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


const buildHTML = (path, data) => {
  const defaultLayout = echoData.layouts[echoOpts.guideLayout],
        layout     = data.data.layout,
        pageLayout = typeof layout !== 'undefined' ? echoData.layouts[data.data.layout] : defaultLayout,
        content    = wrapPage(data.html, pageLayout),
        template   = Handlebars.compile(content);

  fs.writeFileSync(path, Pretty(template(content), {ocd: true}));
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
      type: 'partial',
      name: name,
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
    const content = fileMatter.content;


    // if this file is part of a collection
    if (collection) {

      // create collection if it doesn't exist
      echoData.pages[collection] = echoData.pages[collection] || {
        name: toTitleCase(collection),
        slug: slugify(collection),
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
  files.forEach(function (file) {
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
    const pageSlug = data.slug === echoOpts.keys.views.pages ? '' : Path.sep + data.slug;
    const stubPath = echoOpts.dist + Path.sep + echoOpts.keys.views.pages + pageSlug;
    mkdirp.sync(stubPath);

    Object.entries(data.items).forEach(([page, data]) => {
      buildHTML(stubPath + Path.sep + page + '.html', data);
    });
  });
}


// Build Pages
const buildGuidePages = () => {

  const defaultLayout = echoData.layouts[echoOpts.guideLayout];

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



/**
 * Build Echo
 *
 */
const buildEcho = () => {

  mkdirp.sync(echoOpts.dist);

  buildPages();
  buildGuidePages();
  buildGuideBlocks();

  const index = fs.readFileSync('./src/index.html', 'utf-8');
  // const fileMatter = Matter.read(index);
  const content    = wrapPage(index, echoData.layouts[echoOpts.defaultLayout]),
        template   = Handlebars.compile(content);

  fs.writeFileSync(echoOpts.dist + Path.sep + 'index.html', Pretty(template(content), {ocd: true}));


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


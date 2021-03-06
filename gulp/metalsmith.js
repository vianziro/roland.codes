'use strict';
const Fs = require('fs');
const Path = require('path');

const Cheerio = require('cheerio');
const Collections = require('metalsmith-collections');
const Drafts = require('metalsmith-drafts');
const Excerpts = require('metalsmith-excerpts');
const FrontMatter = require('gulp-front-matter');
const Globby = require('globby');
const Gulp = require('gulp');
const Gulpsmith = require('gulpsmith');
const He = require('he');
const Highlight = require('highlight.js');
const Layouts = require('metalsmith-layouts');
const Livereload = require('gulp-livereload');
const Markdown = require('metalsmith-markdownit');
const Moment = require('moment');
const Nunjucks = require('nunjucks');
const Permalinks = require('metalsmith-permalinks');

const Common = require('./common');

const taskGlob = 'app/content/**/*';
let watching = false;


const nunjucksEnv = Nunjucks.configure(Common.templatesPath, {
    autoescape: false,
    watch: false,
    noCache: true,
});

nunjucksEnv.addFilter('date', (input, format) => Moment(input).format(format));

nunjucksEnv.addFilter('startswith', (input, value) => {
    if (typeof input === 'string') {
        return input.startsWith(value);
    }

    return input;
});

// Unicode encodes all characters
nunjucksEnv.addFilter('encode', (input) => {
    if (typeof input === 'string') {
        return He.encode(input, { encodeEverything: true });
    }

    return input;
});

// Adds classes to an html element
nunjucksEnv.addFilter('class', (input, classes) => {
    if (typeof input === 'string') {
        const $ = Cheerio.load(input);
        $('> *').addClass(classes);
        return $.html();
    }

    return input;
});


Gulp.task('metalsmith', (done) => {
    if (!watching && Common.watch) {
        Gulp.watch([
            taskGlob,
            `${Common.templatesPath}/**/*`
        ], ['metalsmith']);
        watching = true;
    }

    const metadata = {
        baseurl: 'https://roland.codes',
        buildDate: new Date(),
        copyright: `Copyright © 2011-${new Date().getFullYear()} Roland Warmerdam`,
        email: 'hi@roland.codes',
        svgs: {},
    };


    // Load svgs into variables so they can be inlined using metalsmith
    Globby('app/static/assets/images/*.svg').then((paths) => {
        return Promise.all(paths.map((path) => {
            return new Promise((resolve, reject) => {
                const svgName = Path.basename(path, '.svg');

                Fs.readFile(path, { encoding: 'utf8' }, (error, contents) => {
                    if (error) {
                        reject(error);
                    }

                    resolve([svgName, contents]);
                });
            });
        }));
    }).then((svgs) => {
        svgs.forEach(([svgName, contents]) => metadata.svgs[svgName] = contents);
    }).then(() => {
        Gulp.src(taskGlob)
            // Parse front matter for metalsmith
            .pipe(FrontMatter()).on('data', (file) => {
                Object.assign(file, file.frontMatter);
                Reflect.deleteProperty(file, 'frontMatter');
            })
            .pipe(Gulpsmith()
                .metadata(metadata)
                .use(Drafts()) // First to avoid unnecessary parsing
                .use((files) => { // Extract date from filenames before sorting on them
                    const DATE_REGEX = /(\d{4}-\d{2}-\d{2})-(.*?)$/;

                    Object.keys(files).forEach((filename) => {
                        const { base, dir } = Path.parse(filename);
                        const data = files[filename];
                        const match = DATE_REGEX.exec(base);

                        if (!match) {
                            return;
                        }

                        data.date = new Date(match[1]);
                        files[Path.join(dir, match[2])] = data;
                        Reflect.deleteProperty(files, filename);
                    });
                })
                .use(Markdown({
                    html: true,
                    linkify: true,
                    typographer: true,
                    highlight: (code, lang) => {
                        if (lang && Highlight.getLanguage(lang)) {
                            return Highlight.highlight(lang, code).value;
                        }

                        return Highlight.highlightAuto(code).value;
                    }
                }))
                .use(Collections({
                    blog: {
                        pattern: 'blog/*.html',
                        sortBy: 'date',
                        reverse: true,
                    },
                    projects: {
                        pattern: 'projects/*.html',
                        sortBy: 'order',
                    },
                    html: {
                        pattern: '**/*.html',
                    }
                }))
                .use(Permalinks({ relative: false })) // After markdown because it only renames .html files
                .use(Excerpts())
                .use((files) => { // Keep a copy of the contents without layout applied
                    Object.keys(files)
                        .filter((filename) => Path.extname(filename) === '.html')
                        .forEach((filename) => {
                            const data = files[filename];
                            data.prelayoutContents = data.contents;
                        });
                })
                .use(Layouts({ // Last when all the metadata is available
                    engine: 'nunjucks',
                    directory: Common.templatesPath
                })))
            .pipe(Gulp.dest(Common.dest, Common.mode))
            .pipe(Livereload())
            .on('end', done);
    });
});

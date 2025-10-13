// postcss.config.cjs
// Minimal PostCSS config to satisfy Vite and enable autoprefixer.
// This avoids Vite trying to parse other malformed config files.
module.exports = {
    plugins: {
        // autoprefixer ensures basic vendor prefixes for CSS
        autoprefixer: {}
    }
};

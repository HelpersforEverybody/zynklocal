// services/owner-frontend/tailwind.config.cjs
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,jsx,ts,tsx,html}",
        // in case you import shared files from outside this folder:
        "../**/src/**/*.{js,jsx,ts,tsx,html}",
        "./**/*.{html,js,jsx,ts,tsx}"
    ],
    safelist: [
        'bg-blue-600', 'text-white', 'bg-gray-50', 'bg-white', 'text-gray-600', 'rounded', 'p-4', 'p-3', 'px-3', 'py-1',
        // add any other classes you expect to be present
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};

module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx,html}',
    '../**/src/**/*.{js,jsx,ts,tsx,html}',
  ],
  theme: { extend: {} },
  plugins: [],
  safelist: [
    'bg-blue-600','text-white','bg-gray-50','bg-white','text-gray-600',
    'rounded','p-4','p-3','px-3','py-1','flex','gap-2'
  ],
};

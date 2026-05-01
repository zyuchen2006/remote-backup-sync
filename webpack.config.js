const path = require('path');

module.exports = [
  // Extension bundle
  {
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
    },
    externals: {
      vscode: 'commonjs vscode'
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader'
            }
          ]
        }
      ]
    },
    devtool: 'nosources-source-map'
  },
  // WebView bundle
  {
    target: 'web',
    mode: 'none',
    entry: './src/ui/webview/configForm.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'configForm.js',
      libraryTarget: 'umd'
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.webview.json'
              }
            }
          ]
        }
      ]
    },
    devtool: 'nosources-source-map'
  }
];

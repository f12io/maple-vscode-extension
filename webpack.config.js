const path = require('path');

/** @type {import('webpack').Configuration} */
const commonConfig = {
  mode: 'none',
  target: 'node', // Both run in a Node.js environment
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: { module: 'esnext' },
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // This maps the alias to the actual directory on your disk
      '@/shared': path.resolve(__dirname, './shared'),
    },
  },
  externals: {
    vscode: 'commonjs vscode', // Never bundle the 'vscode' module
  },
  devtool: 'source-map',
};

const clientConfig = {
  ...commonConfig,
  entry: './client/src/extension.ts',
  output: {
    filename: 'extension.js',
    path: path.resolve(__dirname, 'dist', 'client'),
    libraryTarget: 'commonjs', // VS Code requires CommonJS entry points
  },
};

const serverConfig = {
  ...commonConfig,
  entry: './server/src/server.ts',
  output: {
    filename: 'server.js',
    path: path.resolve(__dirname, 'dist', 'server'),
    libraryTarget: 'commonjs',
  },
};

module.exports = [clientConfig, serverConfig];

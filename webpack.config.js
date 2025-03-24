const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.ts',
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.svg$/,
        type: 'asset/source',
        generator: {
          filename: 'assets/[name][ext]'
        }
      },
      {
        test: /\.(png|jpg|gif)$/,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'flow.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'CursorFlow',
      type: 'umd',
      export: 'default'
    },
    globalObject: 'this',
    clean: true
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'assets', to: 'assets' },
        { from: 'src/build-dom-tree.js', to: 'build-dom-tree.js' }
      ]
    })
  ],
  devtool: 'source-map',
  optimization: {
    minimize: false,
    moduleIds: 'named',
  }
}; 
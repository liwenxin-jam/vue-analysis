const path = require("path");
const resolve = dir => path.join(__dirname, dir);

console.log(resolve('src'))

module.exports = {
  // import Vue from "vue";  //默认module引入的是run-time, 没有编绎的，就是没有把template转成render的东西
  // 第一种方式手动引入有编译版本的import Vue from 'vue/dist/vue.js'; 或者第二种方式runtimeCompiler转为true，默认加载是编译版本的
  // runtimeCompiler: true,
  configureWebpack: {
    resolve: {
      alias: {
        'vue$': 'vue/dist/vue.esm.js', // 指定需要编译版本的，第三种方式 ，调试指定vue入口文件
        '@': resolve('src')
      }
    }
  },
}
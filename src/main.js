import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";

Vue.config.productionTip = false;

// var vm = new Vue({
//   router,
//   store,
//   render: h => h(App)  // tag 组件方式传入 createComponent
// }).$mount("#app");

// import Vue from "vue"; //默认module引入的是run-time, 没有编译的
// import Vue from 'vue/dist/vue.js';

// _createElement 一个tag方式
var app = new Vue({
  el: '#app',
  // render(createElement) {
  //   return createElement('div', {  // tag 字符串方式传入
  //     attrs: {
  //       id: 'app'
  //     }
  //   }, this.message)
  // },
  data() {
    return {
      message: 'Hello Vue!'
    }
  },
  mounted() {
    // 访问this.message实际内部proxy反射的是this._data.message
    console.log(this.message);
    // 不要这样访问，默认_下划线开头的都应该是私有属性，外部不应该访问
    // console.log(this._data.message);
  }
})
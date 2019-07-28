import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// 真正的入口，Vue其实就是一个方法
function Vue (options) {
  // es5通过function实现类似ES6的class，var vue = new Vue()
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

// 初始化，往原型挂载一系列方法 initGlobalAPI 也挂载了一些原型方法
initMixin(Vue) // _init 
stateMixin(Vue) // $data $props $set $delete $watch
eventsMixin(Vue) // $on $once $off $emit
lifecycleMixin(Vue) // _update $forceUpdate $destroy __patch__
renderMixin(Vue) // $nextTick  _render

export default Vue

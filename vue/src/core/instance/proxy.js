/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (process.env.NODE_ENV !== 'production') {
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  )

  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals. ' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  // 原生是否存在且支持Proxy代理
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  const hasHandler = {
    has (target, key) {
      const has = key in target
      // allowedGlobals是否是一个全局定义的key
      const isAllowed = allowedGlobals(key) ||
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))
      if (!has && !isAllowed) {
        // 1、如果是key存在$data中，但是_下划线开头的，提示warnReservedPrefix警告
        // 2、如果不是_下划线开头，但又没有在data props computed method等相关属性定义，提示warnNonPresent警告
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  // initProxy的目的，就是设置渲染函数的作用域代理，目的是为我们提供更好的提示信息。
  // vue的render的作用域是vm._renderProxy，在本地开发时候，vue对于template里用到的但是没有在data里定义的数据进行提示，
  // 这时候就有了Proxy的has和get拦截。
  initProxy = function initProxy (vm) {
    // hasProxy主要判断浏览是否支持Proxy对象
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      // 有render取render，没有则判断模板
      // webpack配合vue-loader的环境下，将template编译为不是有with语句包裹的遵循严格模式的JS，并为编译后的render方法设置render._withStripped=true。
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
      // 对象访问劫持
      // 不支持Proxy对象vm._renderProxy = vm
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

export { initProxy }

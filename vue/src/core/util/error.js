/* @flow */

//  Vue 全局配置,也就是上面的Vue.config
import config from '../config'
import { warn } from './debug'
// 判断环境
import { inBrowser, inWeex } from './env'
// 判断是否是Promise，通过val.then === 'function' && val.catch === 'function', val ！=== null && val !== undefined
import { isPromise } from 'shared/util'
// 当错误函数处理错误时，停用deps跟踪以避免可能出现的infinite rendering
// 解决以下出现的问题https://github.com/vuejs/vuex/issues/1505的问题
import { pushTarget, popTarget } from '../observer/dep'

export function handleError (err: Error, vm: any, info: string) {
  // Deactivate deps tracking while processing error handler to avoid possible infinite rendering.
  // See: https://github.com/vuejs/vuex/issues/1505
  pushTarget()
  try {
    // vm指当前报错的组件实例
    if (vm) {
      let cur = vm
      // 首先获取到报错的组件，之后递归查找当前组件的父组件，依次调用errorCaptured 方法。
      // 在遍历调用完所有 errorCaptured 方法、或 errorCaptured 方法有报错时，调用 globalHandleError 方法
      while ((cur = cur.$parent)) {
        const hooks = cur.$options.errorCaptured
        // 判断是否存在errorCaptured钩子函数
        if (hooks) {
          // 选项合并的策略，钩子函数会被保存在一个数组中
          for (let i = 0; i < hooks.length; i++) {
            // 如果errorCaptured 钩子执行自身抛出了错误，则用try{}catch{}捕获错误，将这个新错误和原本被捕获的错误都会发送给全局的config.errorHandler
            // 调用globalHandleError方法
            try {
              // 当前errorCaptured执行，根据返回是否是false值
              // 是false，capture = true，阻止其它任何会被这个错误唤起的 errorCaptured 钩子和全局的 config.errorHandler
              // 是true capture = fale，组件的继承或父级从属链路中存在的多个 errorCaptured 钩子，会被相同的错误逐个唤起
              // 调用对应的钩子函数，处理错误
              const capture = hooks[i].call(cur, err, vm, info) === false
              if (capture) return
            } catch (e) {
              globalHandleError(e, cur, 'errorCaptured hook')
            }
          }
        }
      }
    }
    // 除非禁止错误向上传播，否则都会调用全局的错误处理函数
    globalHandleError(err, vm, info)
  } finally {
    popTarget()
  }
}

// 异步错误处理函数
export function invokeWithErrorHandling (
  handler: Function,
  context: any,
  args: null | any[],
  vm: any,
  info: string
) {
  let res
  try {
    // 根据参数选择不同的handle执行方式
    res = args ? handler.apply(context, args) : handler.call(context)
    // handle返回结果存在
    // res._isVue an flag to avoid this being observed，如果传入值的_isVue为ture时(即传入的值是Vue实例本身)不会新建observer实例
    // isPromise(res) 判断val.then === 'function' && val.catch === 'function', val ！=== null && val !== undefined
    // !res._handled  _handle是Promise 实例的内部变量之一，默认是false，代表onFulfilled,onRejected是否被处理
    if (res && !res._isVue && isPromise(res) && !res._handled) {
      res.catch(e => handleError(e, vm, info + ` (Promise/async)`))
      // issue #9511
      // avoid catch triggering multiple times when nested calls
      // 避免嵌套调用时catch多次的触发
      res._handled = true
    }
  } catch (e) {
    // 处理执行错误
    handleError(e, vm, info)
  }
  return res
}

// 全局错误处理
function globalHandleError (err, vm, info) {
  // 获取全局配置，判断是否设置处理函数，默认undefined
  // 已配置
  if (config.errorHandler) {
    // try{}catch{} 住全局错误处理函数
    try {
      // 执行设置的全局错误处理函数，handle error 想干啥就干啥
      return config.errorHandler.call(null, err, vm, info)
    } catch (e) {
      // if the user intentionally throws the original error in the handler,
      // do not log it twice
      // 如果开发者在errorHandler函数中手动抛出同样错误信息throw err
      // 判断err信息是否相等，避免log两次
      // 如果抛出新的错误信息throw err Error('你好毒')，将会一起log输出
      if (e !== err) {
        logError(e, null, 'config.errorHandler')
      }
    }
  }
  // 未配置常规log输出
  logError(err, vm, info)
}

// 错误输出函数
function logError (err, vm, info) {
  if (process.env.NODE_ENV !== 'production') {
    warn(`Error in ${info}: "${err.toString()}"`, vm)
  }
  /* istanbul ignore else */
  if ((inBrowser || inWeex) && typeof console !== 'undefined') {
    console.error(err)
  } else {
    throw err
  }
}

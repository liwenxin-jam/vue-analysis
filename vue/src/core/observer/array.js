/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 克隆数组原型
export const arrayMethods = Object.create(arrayProto)

// 能够改变数组的7个方法，即数组需要劫持的方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  // 数组原来的原型方法
  const original = arrayProto[method]
  // arrayMethods是数组原型，拦截原型方法，添加额外的处理
  def(arrayMethods, method, function mutator (...args) {
    // 执行原先的任务
    const result = original.apply(this, args)
    // 额外任务： 关联响应式
    const ob = this.__ob__
    let inserted
    // 会新增元素的三个方法，需要额外操作
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 做响应式处理
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 通知更新
    ob.dep.notify()
    return result
  })
})

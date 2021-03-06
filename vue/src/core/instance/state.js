/* @flow */

/**
 * 数据模块
 * 导出:
 *   * stateMixin: Vue.prototype的state包装函数
 *   * initState: vue实例的state包装函数
 */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved, // Check if a string starts with $ or _
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

// defineProperty时的公用结构
// 每次使用前都重设get/set可能会是个坑
const sharedPropertyDefinition = {
  enumerable: true,     // 可枚举
  configurable: true,   // 可配置
  get: noop,
  set: noop
}

// 代理访问_props和_data，sourceKey指代的是 _data || _props
// 使用Object.defineProperty重新定义属性, 设置get/set过程
// 代理访问vm[key] -> vm._props[key] || vm._data[key]
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// vue实例包装函数
// 1. 初始化实例props
// 2. 初始化实例methods
// 3. 初始化实例data
// 4. 初始化实例computed
// 5. 初始化实例watch
export function initState (vm: Component) {
  // 设置实例上的_watchers数组用来存储之后生成的watcher实例
  vm._watchers = []
  const opts = vm.$options

  // 属性初始化
  // props初始化
  if (opts.props) initProps(vm, opts.props)
  // methods初始化
  if (opts.methods) initMethods(vm, opts.methods)
  // data没传也需要初始化，设为空对象{}，执行监测
  // 数据响应式
  if (opts.data) {
    initData(vm)
  } else {
    // observe第二个参数表示是否是实例上顶层的data对象， 通过initData调用的observe都需要设为true
    // 主要是在生成observe实例的时候标记一下vmCount
    // 多个组件公用一套options,初始化initData后,vmCount就可以看出该组件被初始化的数目
    observe(vm._data = {}, true /* asRootData */)
  }

  // 计算属性初始化
  if (opts.computed) initComputed(vm, opts.computed)

  // watch初始化
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// 初始化props函数
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}

  // 将props挂载到vm实例_props
  const props = vm._props = {}

  // 第一次初始化props的时候缓存props的key
  // props无法动态增加，所以可以缓存起来，数目不会有变更，当update的时候就不用枚举了
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []

  // 判断是否是顶层vm实例
  const isRoot = !vm.$parent

  // 顶层的vm实例的props需要做一次转化
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    // validateProp主要对props的值进行了检查，如果没有赋值，根据option是否有默认值进行了处理,
    // 并且如果在处理过程中重新赋了值，对新赋的值进行了observe
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 没有执行observe，而是直接执行了observe最终调用的defineReactive方法
      // defineReactive方法设置了属性的getter/setter, 并在getter/setter中启动依赖收集机制
      defineReactive(props, key, value)
    }

    // 代理访问, 静态的props不用代理
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 初始化数据函数
// 对data的处理流程:
// 1. 取options.data
// 2. 处理options.data(考虑函数情况)，复制给实例_data属性
// 3. 对_data属性深度遍历，全部使用defineProperty重新定义一遍（保证getter/setter）
// 4. 对_data的数据生成observe实例, 开启观察者模式
function initData (vm: Component) {
  // 设置vue._data
  // 如果options.data是对象，直接赋值，如果是函数，执行getData方法
  let data = vm.$options.data
  // 初始化，将data放在_data中，Vue组件data为什么必须是个函数？
  // 如果data是函数，则执行之并将其结果作为data选项的值
  // 如果是一个普通对象，组件复用会共用同一个data引用地址，会导致污染问题
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  // 代理这些数据到实例上
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]

    // 开发环境，如果重复定义相同data和methods，则提示warning
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }

    // 开发环境，如果重复定义props和data相同属性，则提示warning
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // isReserved检测key是不是以$或_开头，只有非保留的属性，才执行proxy重新设置defineProperty
      // 真正代理数据的地方，访问data的属性，实际访问的是_data的属性，外部也可以直接访问_data，但不建议，下划线开头一般是内部属性或方法
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 响应式操作，开始观察数据，数据遍历开始
  observe(data, true /* asRootData */)
}

// 若options.data是对象，用该函数封装获取data过程
// 将当前实例vm作为this传给dataFn, 使得dataFn中可以直接使用实例的属性, 如props
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

// 计算属性的watcher是lazy模式的
// lazy模式的watcher手动调用evaluate来收集依赖并得到值
const computedWatcherOptions = { lazy: true }

// 初始化计算属性函数
// 核心是建立watcher, 与watch实现不同的是外加了属性本身的getter
// 过程:
// 1. 在vm上建立_computedWatchers数组存储所有计算属性的watcher
// 2. 根据options.computed建立各个计算属性的watcher
// 3. 根据options.computed传入的方法或表达式建立getter/setter对象
// 4. 在getter中调用watcher来收集依赖
function initComputed (vm: Component, computed: Object) {
  // 单独开辟_computedWatchers对象，存储计算属性的watchers
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]

    // 计算属性值若不是函数，取其get值
    // 参见文档:https://cn.vuejs.org/v2/api/#computed
    const getter = typeof userDef === 'function' ? userDef : userDef.get

    // 开发环境计算属性得不到正确的getter, 报warning
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // 计算属性通过watcher来实现
      // 且watcher的watch对象是一个getter函数
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // 对不在vm实例上的key, 执行defineComputed, 否则开发环境下报warning
    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// 定义计算属性
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  // 计算属性值为函数的情况
  if (typeof userDef === 'function') {
    // 设置计算属性的getter
    // 并没有真实用到userDef, 创建watcher时已经将回调设置好
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    // 计算属性不应该有set, 使用空函数
    sharedPropertyDefinition.set = noop
  } else {
    // 计算属性是个对象情况：
    // 1. 设了get， 缓存情况下取get, 不缓存情况下重新创建getter
    // 2. 没有设get, 为空函数
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    // 计算属性对象情况下的setter设置
    // 计算属性不明确指定set, 则为空函数
    // 计算属性是由其他属性计算而来，一般不用设置set
    sharedPropertyDefinition.set = userDef.set || noop
  }

  // 开发环境下set为空函数发出warning
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  // 重新定义计算属性
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 创建计算属性的getter
// getter方法做的事情:
// 1. 查看当前watcher是否已经dirty
// 2. 已经dirty的情况下重新收集依赖更新自己的value属性
// 3. 返回value
function createComputedGetter (key) {
  return function computedGetter () {
    // 得到当前计算属性的watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // lazy模式下需要先通过evaluate拿到值
      if (watcher.dirty) {
        // evaluate为lazy模式下取值方式
        watcher.evaluate()
      }

      // 依赖队列，比如computedAttr1中依赖于computedAttr2
      // 此处情况是computedAttr1的getter过程中会触发computedAttr2的getter
      // 当computedAttr2执行完evaluate后，Dep.target会pop为computedAttr1的watcher
      // 此时computedAttr2需要将自己依赖的属性加入到computedAttr1的依赖属性中
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

// 初始化methods函数
// methods的处理比较简单，只是将methods挨个赋到vm实例上，作为实例方法
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    // 开发环境下一下情况提示warning
    // 1. method值为空
    // 2. props上定一下同名属性
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // method如果是null, 设为空函数
    // 否则绑定this到vm, 加到实例上
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// 初始化watch函数
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    // watch也可以是一个数组, 如果是数组则循环遍历创建watcher
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 创建watcher
// 装饰vm.$watch的参数
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 处理watch为对象的情况，见文档:
  // https://cn.vuejs.org/v2/api/#watch
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }

  // 处理watch为字符串情况, 取vm中方法
  if (typeof handler === 'string') {
    handler = vm[handler]
  }

  // $watch在stateMixin中添加的原型链方法
  // 实际就是新建了一个watcher实例
  return vm.$watch(expOrFn, handler, options)
}

// Vue原型链上增加: $data $props $set $delete $watch
export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }

  // dataDef, 和propsDef的getter实际返回的是vue实例的_data和_props引用
  // 所以$data和$props实际只是将内部对象按照约定格式$开头的暴露出来
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 根据cb的类型去区别，一种是function方法，一种是object对象
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this

    // 回调函数是对象，参数需要预处理，通过createWatcher来处理
    // 此处会递归处理
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}

    // 用户相关的，options.watch和$watch时，如computed的watch，options.user=true
    // 组件相关的，即组件的watcher，options.user=false
    options.user = true
    // 创建一个watcher, 参数: vm实例，key, 回调函数,options
    const watcher = new Watcher(vm, expOrFn, cb, options)

    // 是否立即执行watch回调
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }

    // 返回解除watch函数
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}

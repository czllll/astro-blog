---
title: "synchronized和volatile-从单例的实现说起"
description: "从Java实现单例的方式说起，穿插介绍了Synchronized，volatile等关键字的说明，最后介绍了两种更巧妙的单例模式实现"
published: 2023-12-10
updated: 2023-12-10
tags:
  - design-pattern
  - java
lang: zh
abbrlink: singleton-synchronized-volatile
---
## 单例模式的实现

单例我们都很熟悉，从定义上说就是单例对象的类必须保证只有⼀个实例存在，单例模式确保一个类只有一个实例，并提供全局访问点。在实现方式上来说有**懒汉式**和**饿汉式**。

他们之间的区别在于：

1. 懒汉式：指全局的单例实例在第⼀次被使⽤时构建
2. 饿汉式：指全局的单例在类装载时构建

### 懒汉式

#### 实现1

我们先来看第一种实现方式：

```java
//version1
class Singleton {
    private static Singleton instance;
    //构造器私有防止被外部类调用
    private Singleton() {}
    public static Singleton getInstance() {
        if (instance == null) {
            instance = new Singleton();
        }
        return instance;
    }


}
public class Main{
    public static void main(String[] args) {
        //Singleton singleton =  new Singleton();
      	//由于构造器私有，我们使用类的静态方法来获取实例
        Singleton obj = Singleton.getInstance();
        System.out.println(obj.getInstance().toString());
    }
}
Output：
Singleton@30f39991
```

* 方法逻辑

  这种方式在每次获取instance之前先进⾏判断，如果instance 为空就new⼀个出来，否则就直接返回已存在的 instance。
* 问题

  多线程工作，都运行到 ``if (instance == null)``时，均判断为 `null`，这些线程就都会创建实例，这样就不是单例了。

  我们可以使用 `CountDownLatch`来控制两个线程同时运行到 `getInstance()`方法的时刻，代码如下：

  ```java
  public class Main{
      public static void main(String[] args) throws InterruptedException {
          int numberOfThreads = 2;
          CountDownLatch latch = new CountDownLatch(numberOfThreads);
          Runnable runnable = () -> {
              try {
                  latch.countDown();
                  latch.await(); // 等待其他线程就绪
                  Singleton instance = Singleton.getInstance();
                	//打印当前线程和实例信息
                  System.out.println("当前线程:" + Thread.currentThread().getName() + " - 当前实例为: " + instance.toString());
              } catch (InterruptedException e) {
                  e.printStackTrace();
              }
          };

          Thread[] threads = new Thread[numberOfThreads];
          for (int i = 0; i < numberOfThreads; i++) {
              threads[i] = new Thread(runnable);
              threads[i].start();
          }

          for (Thread thread : threads) {
            thread.join();
          }
      }

  }
  output:
  case1
  当前线程为: Thread-1 - 当前实例为: Singleton@25e4c956
  当前线程为: Thread-0 - 当前实例为: Singleton@3e483bf7
  case2
  当前线程为: Thread-0 - 当前实例为: Singleton@726166f6
  当前线程为: Thread-1 - 当前实例为: Singleton@726166f6
  ```

  这里我们稍微讲一下CountDownLatch关键字，它的作用是允许一个或多个线程等待其他线程完成操作。主要方法如下（Java21），省略实现细节：

  ```java
  public class CountDownLatch {
      private final Sync sync;
      // CountDownLatch构造函数，接收一个count参数，创建一个Sync对象
      public CountDownLatch(int count) {}
    	// 等待直到计数器减为零
      public void await() throws InterruptedException {}
    	// 在指定的超时时间内等待，直到计数器减为零
      public boolean await(long timeout, TimeUnit unit) throws InterruptedException {}
      // 计数器减一
    	public void countDown() {}
      public long getCount() {}
      public String toString() {}
    	// 内部类Sync，继承自AbstractQueuedSynchronizer，用于控制计数器
      private static final class Sync extends AbstractQueuedSynchronizer {
          private static final long serialVersionUID = 4982264981922014374L;
          Sync(int count) {}
          int getCount() {}
          protected int tryAcquireShared(int acquires) {}
          protected boolean tryReleaseShared(int releases) {}
      }
  }

  ```

  我们可以发现，这个类内部使用了同步器 `Sync`，它继承自 `AbstractQueuedSynchronizer`。受限于篇幅，AQS之后再进行分析。

  在上述控制两个线程同时运行到 `getInstance()`的代码中，我们使用：

  ```java
  latch.countDown();//计数器减一，表示当前线程已经就绪
  latch.await(); // 让当前线程等待，直到计数器归零
  ```

  使得所有线程在开始执行实例获取操作之前都准备就绪，让两个线程同时开始获取单例。

  *PS.操作系统的线程调度、硬件资源和其他系统因素可能会导致微小的时间差。这些微小的差异可能导致在实际执行中出现极短的时间间隔，因此线程的启动并不会严格同时，**因此会出现不同的Output**。*
* 解决

  解决也很容易想到，我们可以加一个 `synchronized`关键字在 `getInstance`方法上，我们来到第二个版本的单例实现。

#### 实现2（使用synchronized）

```java
//version2
class Singleton {
    private static Singleton instance;
    //构造器私有防止被外部类调用
    private Singleton() {}
    public static synchronized Singleton getInstance() {
        if (instance == null) {
            instance = new Singleton();
        }
        return instance;
    }
}
Output:
当前线程为: Thread-1 - 当前实例为: Singleton@46bd3fc9
当前线程为: Thread-0 - 当前实例为: Singleton@46bd3fc9
```

* 我们可以成功获得同一个单例。
* 问题

  每次调用 `getInstance()` 方法都需要获得锁，即使实例已经创建，后续的线程仍然会进入同步块，造成了线程阻塞和性能损耗。
* 解决

  我们在方法上加锁导致锁的粒度太大了，我们可以缩小锁的粒度，在方法里面加锁，即得到第三个版本的单例实现，也称为双重检查（Double-Check)。

#### 实现3：双重检查（Double-Check Lock)

```java
//version3
class Singleton {
    private static Singleton instance;
    private Singleton() {}
    public static Singleton getInstance() {
        if (instance == null) {
            synchronized (Singleton.class) {
                if (instance == null) {
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

* 逻辑

  * 第一个 `if (instance == null)`为了提高性能，避免实例已经创建的情况下获得锁
  * 第二个 `if (instance == null)`确保在即使多个线程同时调用 `getInstance()`时，只有一个线程创建实例，和version2的作用一样
* 问题

  首先说明，这种方法在编译器的优化下可能会发生指令的重排序，从而导致线程不安全的情况出现。

  我们首先来看下JVM在 `singleton = new Singleton()`做了什么事情：

  1. 在堆内存中，给 singleton 分配内存
  2. 调⽤ Singleton 的构造函数来初始化成员 变量，形成实例
  3. 将singleton对象指向分配的内存空间（完成后此时singleton非null）

  那么就会存在问题，因为JVM编译器存在指令重排的优化，因此上述的2，3 顺序不能保证。我们可以试想线程A执行初始化时是1-3-2这种情况，在3已经执行完毕，2未执行之前，被线程B抢占了。导致的结果就是，此时线程A得到的是一个 **未初始化但非NULL**的实例，线程B判断instance非null，直接返回，导致错误。

  关键点在于： **线程A对instance的写操作没有完成，线程B就执行了读操作**

  由此我们引出使用volatile关键词的第四个版本

#### 实现4（使用volatile）

```java
class Singleton {
    private static volatile Singleton instance;
    //构造器私有防止被外部类调用
    private Singleton() {}
    public static Singleton getInstance() {
        if (instance == null) {
            synchronized (Singleton.class) {
                if (instance == null) {
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

相比于实现三，只是给 `instance`的声明加上了 `volatile`关键字。

我们先来讲下 `volatile`关键字

##### volatile

**volatile关键字有两个作用**

1. 保证可见性

   当一个变量被声明为 `volatile` 时，这意味着当一个线程修改了这个变量的值，这个新值会立即被其他线程看到，从而确保了多线程之间对该变量的访问是可见的。这是因为写入 `volatile` 变量的操作会导致缓存中的数据被刷新到主内存，以确保其他线程可以读取到最新的值。
2. 禁止指令重排序

   `volatile` 变量的读写操作会禁止编译器和运行时环境对这些操作进行重排序。这可以确保指令不会被乱序执行，从而保证了操作的有序性。

还有需要注意的一点是，volatile**不能**保证完全的原子性，只能保证单次的读/写操作具有原子性。

**volatile的实现原理**

1. volatile 变量的内存可见性是基于内存屏障(Memory Barrier)实现。MM 为了保证在不同的编译器和 CPU 上有相同的结果，通过插入特定类型的内存屏障来禁止+ 特定类型的编译器重排序和处理器重排序，插入一条内存屏障会告诉编译器和 CPU：不管什么指令都不能和这条 Memory Barrier 指令重排序。
2. 而volatile是使用happens-before原则来保证有序性实现的，原则如下：

   对一个 volatile 域的写，happens-before 于任意后续对这个 volatile 域的读。

具体到本例而言，volatile阻⽌的不 `singleton = new Singleton()`这句话内部[1-2-3]的指令重排，⽽是保证了在⼀个写操作（[1-2-3]） 完成之前，不会调⽤读操作 `if (instance == null)`。

在查询相关资料时，发现了使用ThreadLocal来修正DCL问题的一种思路：

#### 实现5：ThreadLocal

//TODO

至此，我们得到了比较完整的Java的懒汉式单例模式的实现。我们再来看看饿汉式的实现：

### 饿汉式

饿汉式在类加载时就创建并初始化了单例对象。

```java
public class Singleton {
    // 在类加载时就创建并初始化单例对象
    private static final Singleton instance = new Singleton();

    // 私有化构造函数，防止外部实例化
    private Singleton() {}

    // 提供获取实例的静态方法
    public static Singleton getInstance() {
        return instance;
    }
}
```

* 逻辑

  为什么把 `instance`声明为 `static final`就可以表示为单例呢？

  我们先来回顾一下Java类的生命周期：

  1. **加载**

     jvm需要完成：

     1. 通过类的权限定名获得类的字节码文件
     2. 把字节码文件中的静态存储结构转换为方法区的运行时数据结构
     3. 在Java堆中生成一个代表这个类的java.lang.Class对象，作为对方法区中这些数据的访问入口。
  2. **链接**

     1. 验证
     2. 准备

        为类的静态变量分配内存，并将其初始化为默认值。

        **注意**：

        * 仅包括静态变量(`static`)，实例变量会在对象实例化时随着对象一块分配在Java堆中。
        * 初始值通常情况下是数据类型默认的零值，非显式赋予的值
     3. 解析

        常量池内符号引用转换为直接引用，从而确定类、字段、方法等在内存中的具体位置和地址。
  3. **初始化**

     主要对静态变量进行初始化

  由此我们可以得知，被声明为 `static final`的instance在类加载的准备阶段就已经被赋予了指定的值，它的初始化是在类加载的链接阶段完成。由于类加载过程是线程安全的，所以静态常量的赋值也是**线程安全**的；同时由于其为 **常量**，在整个程序运行过程中保持不变。可以保证单例的**唯一性**，因为常量在赋值后无法再次修改。
* 问题

  对于饿汉式单例，来讲上述写法即为标准写法，饿汉式单例的问题不是写法上的问题，而是饿汉式既有的问题。

  饿汉式单例模式的缺点是可能会造成资源浪费，因为无论是否使用，实例都会在类加载时创建，如果这个实例很大或者初始化比较复杂，可能会影响应用程序的启动速度和内存消耗。

此外我们还有静态内部类，枚举类等的方法实现单例模式

### 静态内部类

```java
public class Singleton {
    private Singleton() {
        // 私有化构造函数，防止外部直接实例化
    }

    // 静态内部类
    private static class SingletonHolder {
        private static final Singleton INSTANCE = new Singleton();
    }

    // 公共方法获取单例实例
    public static Singleton getInstance() {
        return SingletonHolder.INSTANCE;
    }
}

```

* 逻辑

  `SingletonHolder` 类是 `Singleton` 类的静态内部类。静态内部类在 `Singleton` 类加载时就会被初始化，并创建 `INSTANCE` 变量。于 `Singleton` 类的构造函数私有化，因此只能在 `SingletonHolder` 类中创建 `Singleton` 类的实例。

  因此，在 `getInstance()` 方法被调用之前，`INSTANCE` 变量已经被初始化为 `Singleton` 类的实例，因此不会发生竞争。

  具体来说，当多个线程同时调用 `getInstance()` 方法时，会发生以下情况：

  1. 第一个线程会进入 `SingletonHolder` 类的初始化代码块，并创建 `Singleton` 类的实例，并将其赋值给 `INSTANCE` 变量。
  2. 其他线程在进入 `getInstance()` 方法时，会发现 `INSTANCE` 变量已经被初始化，因此不会再进入 `SingletonHolder` 类的初始化代码块，而是直接从 `INSTANCE` 变量中获取 `Singleton` 类的实例。

  因此，只有一个线程会进入 `SingletonHolder` 类的初始化代码块，从而保证了线程安全。

### 枚举类

```java
public enum Singleton {
    INSTANCE; // 枚举类型实例

    // 可以在这里添加其他方法或属性
}

```

* 逻辑

  枚举类型在编译器生成的 Java 代码中会被转换成类，而枚举值本身会被转换成常量，在类加载的过程中，这些常量会被初始化为枚举类型的实例，而且这个过程是线程安全的。因此，无论何时何地，当你引用枚举的某个值时，你得到的都是相同的实例。

  上述代码会被编译器转化为类似如下代码：

  ```java
  public final class Singleton extends Enum<Singleton> {
      public static final Singleton INSTANCE = new Singleton();
      // 其他枚举相关代码
  }
  ```

  枚举类实现单例模式也是在类加载时就创建单例实例，因此也是饿汉式实现方式。

总结一下，单例模式是一种确保类只有一个实例并提供全局访问点的设计模式。在Java中，我们可以使用多种方法实现单例，包括懒汉式、饿汉式、静态内部类和枚举类等。每种实现方式都有其优缺点，需要根据具体需求来选择适合的方式。懒汉式可能存在线程安全问题，需要额外的同步机制来解决；而饿汉式在类加载时就创建实例，可能会带来资源浪费。静态内部类利用类加载机制实现了线程安全和懒加载，而枚举类则通过枚举的特性天然地保证了单例。选择单例实现方式时，需综合考虑线程安全性、资源消耗以及实现复杂度等因素，以便在特定场景中找到最合适的方法。

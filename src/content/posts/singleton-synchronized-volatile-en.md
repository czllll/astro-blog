---
title: "synchronized & volatile: reasoning from the singleton pattern"
description: "Walk through several singleton implementations to explain why synchronized, double-checked locking and volatile matter, and how eager, static-inner-class and enum singletons compare."
published: 2023-12-10
updated: 2023-12-10
tags:
  - design-pattern
  - java
lang: en
abbrlink: singleton-synchronized-volatile
---

*This post was translated by LLM.*

## Implementing the Singleton Pattern

The definition of a singleton says that a class must guarantee there is only **one** instance and must offer a global access point. In practice we usually distinguish between the **lazy** (create on first use) and the **eager** (create when the class is loaded) strategies.

Lazy vs. eager:

1. Lazy: the global instance is created the first time it is needed.
2. Eager: the global instance is created while the class is being loaded.

### Lazy singleton

#### Implementation 1

Let's start with the most naïve version:

```java
// version1
class Singleton {
    private static Singleton instance;
    // Private constructor prevents external code from calling new
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
        // Singleton singleton = new Singleton();
        // Because the constructor is private, call the static method instead
        Singleton obj = Singleton.getInstance();
        System.out.println(obj.getInstance().toString());
    }
}
Output:
Singleton@30f39991
```

*Logic*  
Before every access we check whether `instance` is `null`; if so we create it, otherwise we just return the existing object.

*Problem*  
When multiple threads run to `if (instance == null)` at the same time, they all see `null` and each creates its own object, breaking the singleton guarantee.

To reproduce this we can use `CountDownLatch` to make two threads call `getInstance()` simultaneously:

```java
public class Main{
    public static void main(String[] args) throws InterruptedException {
        int numberOfThreads = 2;
        CountDownLatch latch = new CountDownLatch(numberOfThreads);
        Runnable runnable = () -> {
            try {
                latch.countDown();
                latch.await(); // wait for the other thread
                Singleton instance = Singleton.getInstance();
                // print current thread and instance info
                System.out.println("Thread: " + Thread.currentThread().getName()
                    + " - instance: " + instance);
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
Thread: Thread-1 - instance: Singleton@25e4c956
Thread: Thread-0 - instance: Singleton@3e483bf7
case2
Thread: Thread-0 - instance: Singleton@726166f6
Thread: Thread-1 - instance: Singleton@726166f6
```

`CountDownLatch` lets one or more threads wait until other threads have finished a certain operation. The major methods in Java 21 (implementation omitted) are:

```java
public class CountDownLatch {
    private final Sync sync;
    // Constructor takes the count and creates a Sync
    public CountDownLatch(int count) {}
    // Wait until the counter reaches zero
    public void await() throws InterruptedException {}
    // Wait with timeout
    public boolean await(long timeout, TimeUnit unit) throws InterruptedException {}
    // Decrease the counter by one
    public void countDown() {}
    public long getCount() {}
    public String toString() {}
    // Inner Sync class extends AbstractQueuedSynchronizer
    private static final class Sync extends AbstractQueuedSynchronizer {
        private static final long serialVersionUID = 4982264981922014374L;
        Sync(int count) {}
        int getCount() {}
        protected int tryAcquireShared(int acquires) {}
        protected boolean tryReleaseShared(int releases) {}
    }
}
```

Internally it uses a synchronizer that extends `AbstractQueuedSynchronizer` (AQS). We'll leave AQS itself for another article.

In the earlier sample we used:

```java
latch.countDown(); // decrease the counter to signal readiness
latch.await();     // block until the counter hits zero
```

to make sure both threads start fetching the singleton at the same time.

*PS:* operating-system scheduling, hardware timing, and other factors can still cause tiny differences. Threads do not start at the exact same nanosecond, so the output may vary between runs.

*Fix*  
The obvious idea is to add `synchronized` to `getInstance()`, which leads us to the second version.

#### Implementation 2 (synchronized method)

```java
// version2
class Singleton {
    private static Singleton instance;
    private Singleton() {}
    public static synchronized Singleton getInstance() {
        if (instance == null) {
            instance = new Singleton();
        }
        return instance;
    }
}
Output:
Thread: Thread-1 - instance: Singleton@46bd3fc9
Thread: Thread-0 - instance: Singleton@46bd3fc9
```

* We now obtain the same object every time.

*Problem*  
Every call to `getInstance()` must acquire the lock even after the object has been created, which means blocked threads and wasted time.

*Fix*  
Instead of locking the whole method we can narrow the critical section to reduce contention. This produces the third version, also known as double-checked locking (DCL).

#### Implementation 3 (Double-Checked Locking)

```java
// version3
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

*Logic*

* The first `if (instance == null)` avoids locking when the object already exists.
* The second `if (instance == null)` ensures that, even if several threads enter the method at the same time, only one of them creates the instance (same role as version2).

*Problem*  
Compiler and CPU optimizations may reorder instructions, which breaks thread safety.

What does `singleton = new Singleton()` actually do?

1. Allocate memory on the heap.
2. Call the constructor to initialize the fields.
3. Assign the object reference to `singleton` (which now becomes non-null).

If steps 2 and 3 are reordered (e.g. 1-3-2), thread A might finish step 3 before step 2, then get preempted. Thread B reads `instance != null` and returns the partially constructed object. In other words, **thread A has not finished writing when thread B begins reading**.

Hence version 4 introduces `volatile`.

#### Implementation 4 (volatile)

```java
class Singleton {
    private static volatile Singleton instance;
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

This is identical to version 3 except that the field is declared `volatile`.

Let's revisit what `volatile` means.

##### volatile

`volatile` has two effects:

1. **Visibility** – when one thread writes to a `volatile` variable, the new value is flushed to main memory so every other thread sees it immediately. The write invalidates cached copies in CPU cores, forcing readers to fetch the latest value.
2. **Prohibiting instruction reordering** – neither the compiler nor the CPU may reorder reads/writes around a `volatile` access, which preserves the required happens-before relationship.

Note that `volatile` does **not** provide full atomicity; it only guarantees that each individual read or write is atomic.

**How it works**

1. Memory visibility is implemented via memory barriers. They tell the compiler and CPU that nothing may be reordered across the barrier.
2. The Java Memory Model expresses this using the happens-before rule: a write to a `volatile` field happens-before every subsequent read of that same field.

In our singleton, volatile does not stop the internal steps (1-2-3) from being reordered, but it guarantees that the write cannot be observed by another thread before the constructor has finished, because the assignment (step 3) cannot move ahead of the constructor (step 2).

While reading about DCL you may also encounter an idea that uses ThreadLocal to “fix” it:

#### Implementation 5: ThreadLocal

// TODO

So far we have covered the lazy family of implementations. Next up is the eager approach.

### Eager singleton

An eager singleton creates the instance when the class is loaded.

```java
public class Singleton {
    // Create and initialize the singleton during class loading
    private static final Singleton instance = new Singleton();

    // Private constructor prevents external instantiation
    private Singleton() {}

    // Public accessor
    public static Singleton getInstance() {
        return instance;
    }
}
```

*Logic*

Why does `static final` suffice for a singleton?

Recall the lifecycle of a Java class:

1. **Loading**
   1. Locate the class bytecode via the fully qualified name.
   2. Convert the static storage structures in the bytecode into the runtime data structures in the method area.
   3. Create a `java.lang.Class` object on the heap to serve as the access entry for the method-area data.
2. **Linking**
   1. *Verification*
   2. *Preparation* – allocate memory for static variables and set them to their default values.

      **Notes:**

      * Only static variables are involved; instance fields are allocated when objects are instantiated.
      * The default value is usually the zero value of the type unless an explicit initializer is provided.
   3. *Resolution* – convert symbolic references in the constant pool into direct references (addresses).
3. **Initialization** – run the class initializer to assign the actual values to static variables.

The `static final` field is assigned during the preparation phase, and initialization happens during class initialization. Class loading itself is thread-safe, so writing to that static constant is also **thread-safe**. Because the field is a **constant**, it cannot change afterwards, which preserves **uniqueness**.

*Problem*

The code above is the canonical eager singleton. Its drawbacks are inherent to the eager approach: the instance is created even if it is never used. When the object is heavy or expensive to initialize, this wastes memory and slows down startup.

We still have two additional patterns: static inner classes and enums.

### Static inner class

```java
public class Singleton {
    private Singleton() {
        // Private constructor prevents direct instantiation
    }

    // Static inner class
    private static class SingletonHolder {
        private static final Singleton INSTANCE = new Singleton();
    }

    // Public accessor
    public static Singleton getInstance() {
        return SingletonHolder.INSTANCE;
    }
}
```

*Logic*

`SingletonHolder` is a static inner class. It is initialized when `Singleton` is loaded, and it creates the `INSTANCE` field. Because `Singleton`'s constructor is private, the only place that can instantiate it is the inner class.

This means `INSTANCE` is already initialized before `getInstance()` is ever called, so there is no race. More specifically:

1. The first thread that calls `getInstance()` triggers the initialization block of `SingletonHolder`, which creates the `Singleton` instance and assigns it to `INSTANCE`.
2. The other threads find that `INSTANCE` already exists and simply return it without re-entering the initialization block.

Therefore only one thread runs the initialization code, which gives us thread safety while keeping lazy semantics (since the holder class is loaded only when needed).

### Enum-based singleton

```java
public enum Singleton {
    INSTANCE; // Enum value

    // Additional methods or fields can be declared here
}
```

*Logic*

When the compiler translates an enum, it generates a class and turns each enum constant into a static final field. Those constants are instantiated during class loading, and the process is thread-safe. Whenever you reference `Singleton.INSTANCE` you get the same object.

Conceptually it becomes something like:

```java
public final class Singleton extends Enum<Singleton> {
    public static final Singleton INSTANCE = new Singleton();
    // other enum-related code
}
```

Because the instance is created during class loading, the enum approach is also an eager singleton.

---

To wrap up: the singleton pattern guarantees a single instance with a global access point. In Java we can implement it via lazy loading (with synchronization, DCL + volatile, etc.), eager loading, static inner classes, or enums. Each approach has trade-offs. Lazy implementations need extra synchronization to avoid races, eager ones may waste resources, the static-inner-class trick gives us lazy loading with thread safety courtesy of the class loader, and enums provide a concise, reflection-safe eager singleton. Choose the implementation that best balances thread safety, resource usage, and complexity for your scenario.

export class ReactiveEventEmitter {
  constructor() {
    this.events = new Map();
    this.middleware = [];
    this.maxListeners = 10;
  }

  subscribe(eventName, listener, options = {}) {
    return this.on(eventName, listener, options);
  }

  unsubscribe(eventName, listener) {
    return this.off(eventName, listener);
  }

  on(eventName, listener, options = {}) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }

    const eventSet = this.events.get(eventName);
    
    if (eventSet.size >= this.maxListeners) {
      console.warn(`Max listeners (${this.maxListeners}) exceeded for event "${eventName}"`);
    }

    const enhancedListener = this.createEnhancedListener(listener, options);
    eventSet.add(enhancedListener);

    return () => this.off(eventName, enhancedListener);
  }

  off(eventName, listener) {
    if (!this.events.has(eventName)) return false;
    
    const eventSet = this.events.get(eventName);
    const deleted = eventSet.delete(listener);
    
    if (eventSet.size === 0) {
      this.events.delete(eventName);
    }
    
    return deleted;
  }

  emit(eventName, ...args) {
    const processedArgs = this.applyMiddleware(eventName, args);
    
    if (!this.events.has(eventName)) return false;
    
    const listeners = Array.from(this.events.get(eventName));
    let hasListeners = false;

    for (const listener of listeners) {
      hasListeners = true;
      try {
        const result = listener(...processedArgs);
        if (result instanceof Promise) {
          result.catch(err => 
            console.error(`Async error in listener for event "${eventName}":`, err)
          );
        }
      } catch (err) {
        console.error(`Error in listener for event "${eventName}":`, err);
      }
    }

    return hasListeners;
  }

  once(eventName, listener, options = {}) {
    const wrapper = (...args) => {
      this.off(eventName, wrapper);
      return listener(...args);
    };
    return this.on(eventName, wrapper, options);
  }

  use(middleware) {
    this.middleware.push(middleware);
  }

  applyMiddleware(eventName, args) {
    return this.middleware.reduce((processedArgs, middleware) => {
      return middleware(eventName, processedArgs) || processedArgs;
    }, args);
  }

  createEnhancedListener(listener, options) {
    let callCount = 0;
    
    return (...args) => {
      if (options.maxCalls && callCount >= options.maxCalls) {
        return;
      }
      
      callCount++;
      
      if (options.delay) {
        setTimeout(() => listener(...args), options.delay);
      } else {
        return listener(...args);
      }
    };
  }

  eventNames() {
    return Array.from(this.events.keys());
  }

  listenerCount(eventName) {
    return this.events.has(eventName) ? this.events.get(eventName).size : 0;
  }

  removeAllListeners(eventName) {
    if (eventName) {
      this.events.delete(eventName);
    } else {
      this.events.clear();
    }
  }
}

export class Observable {
  constructor(subscriber) {
    this.subscriber = subscriber;
  }

  subscribe(observer) {
    const subscription = new Subscription();
    
    try {
      const unsubscribe = this.subscriber({
        next: (value) => {
          if (!subscription.closed && observer.next) {
            observer.next(value);
          }
        },
        error: (error) => {
          if (!subscription.closed && observer.error) {
            observer.error(error);
            subscription.unsubscribe();
          }
        },
        complete: () => {
          if (!subscription.closed && observer.complete) {
            observer.complete();
            subscription.unsubscribe();
          }
        }
      });

      subscription.setUnsubscribe(unsubscribe);
    } catch (error) {
      if (observer.error) {
        observer.error(error);
      }
    }

    return subscription;
  }

  map(transformFn) {
    return new Observable(observer => {
      return this.subscribe({
        next: value => observer.next(transformFn(value)),
        error: err => observer.error(err),
        complete: () => observer.complete()
      });
    });
  }

  filter(predicate) {
    return new Observable(observer => {
      return this.subscribe({
        next: value => {
          if (predicate(value)) {
            observer.next(value);
          }
        },
        error: err => observer.error(err),
        complete: () => observer.complete()
      });
    });
  }

  debounce(delay) {
    return new Observable(observer => {
      let timeout;
      return this.subscribe({
        next: value => {
          clearTimeout(timeout);
          timeout = setTimeout(() => observer.next(value), delay);
        },
        error: err => observer.error(err),
        complete: () => observer.complete()
      });
    });
  }

  merge(other) {
    return new Observable(observer => {
      let completed = 0;
      const checkComplete = () => {
        if (++completed === 2) observer.complete();
      };

      const sub1 = this.subscribe({
        next: value => observer.next(value),
        error: err => observer.error(err),
        complete: checkComplete
      });

       const sub2 = other.subscribe({
        next: value => observer.next(value),  
        error: err => observer.error(err),
        complete: checkComplete
      });

      return () => {
        sub1.unsubscribe();
        sub2.unsubscribe();
      };
    });
  }

  static of(...values) {
    return new Observable(observer => {
      values.forEach(value => observer.next(value));
      observer.complete();
    });
  }

  static fromEvent(target, eventName) {
    return new Observable(observer => {
      const handler = (event) => observer.next(event);
      target.addEventListener(eventName, handler);
      
      return () => target.removeEventListener(eventName, handler);
    });
  }

  static interval(period) {
    return new Observable(observer => {
      let count = 0;
      const interval = setInterval(() => {
        observer.next(count++);
      }, period);
      
      return () => clearInterval(interval);
    });
  }
}

class Subscription {
  constructor() {
    this.closed = false;
    this.unsubscribeFn = null;
  }

  setUnsubscribe(fn) {
    this.unsubscribeFn = fn;
  }

  unsubscribe() {
    if (!this.closed) {
      this.closed = true;
      if (this.unsubscribeFn) {
        this.unsubscribeFn();
      }
    }
  }
}

export class Subject extends Observable {
  constructor() {
    super(observer => {
      this.observers.add(observer);
      return () => this.observers.delete(observer);
    });
    this.observers = new Set();
    this.closed = false;
  }

  next(value) {
    if (this.closed) return;
    for (const observer of this.observers) {
      if (observer.next) observer.next(value);
    }
  }

  error(error) {
    if (this.closed) return;
    for (const observer of this.observers) {
      if (observer.error) observer.error(error);
    }
    this.closed = true;
  }

  complete() {
    if (this.closed) return;
    for (const observer of this.observers) {
      if (observer.complete) observer.complete();
    }
    this.closed = true;
  }
}

export class ReactiveEntity {
  constructor(name) {
    this.name = name;
    this.emitter = new ReactiveEventEmitter();
    this.state$ = new Subject();
    this.state = {};
  }

  setState(newState) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };
    
    const stateChange = {
      entity: this.name,
      oldState,
      newState: this.state,
      changes: newState,
      timestamp: Date.now()
    };
    
    this.state$.next(stateChange);
    this.emitter.emit('stateChange', stateChange);
  }

  sendMessage(target, message, data = {}) {
    const messageObj = {
      from: this.name,
      to: target,
      message,
      data,
      timestamp: Date.now()
    };
    
    this.emitter.emit('message', messageObj);
    return messageObj;
  }

  onMessage(callback) {
    return this.emitter.subscribe('message', callback);
  }

  onStateChange(callback) {
    return this.state$.subscribe({ next: callback });
  }

  connectTo(otherEntity) {
    this.emitter.subscribe('message', (msg) => {
      if (msg.to === otherEntity.name) {
        otherEntity.emitter.emit('receivedMessage', msg);
      }
    });

    otherEntity.emitter.subscribe('message', (msg) => {
      if (msg.to === this.name) {
        this.emitter.emit('receivedMessage', msg);
      }
    });
  }

  destroy() {
    this.emitter.removeAllListeners();
    this.state$.complete();
  }
}

export class ChatUser extends ReactiveEntity {
  constructor(username) {
    super(username);
    this.setState({ online: true, messages: [] });
    
    this.emitter.subscribe('receivedMessage', (msg) => {
      this.setState({ 
        messages: [...this.state.messages, msg] 
      });
      console.log(`${this.name} received: ${msg.message} from ${msg.from}`);
    });
  }

  sendChatMessage(target, message) {
    return this.sendMessage(target, message, { type: 'chat' });
  }

  goOffline() {
    this.setState({ online: false });
  }

  goOnline() {
    this.setState({ online: true });
  }
}

export class GamePlayer extends ReactiveEntity {
  constructor(playerName) {
    super(playerName);
    this.setState({ 
      health: 100, 
      position: { x: 0, y: 0 }, 
      score: 0 
    });

    this.emitter.subscribe('receivedMessage', (msg) => {
      if (msg.data.type === 'damage') {
        this.takeDamage(msg.data.amount);
      }
    });
  }

  move(x, y) {
    this.setState({ position: { x, y } });
  }

  takeDamage(amount) {
    const newHealth = Math.max(0, this.state.health - amount);
    this.setState({ health: newHealth });
    
    if (newHealth === 0) {
      this.emitter.emit('playerDeath', { player: this.name });
    }
  }

  attack(target, damage) {
    return this.sendMessage(target, 'attack', { 
      type: 'damage', 
      amount: damage 
    });
  }

  addScore(points) {
    this.setState({ score: this.state.score + points });
  }
}

export function demonstrateReactiveCommunication() {
  console.log('=== Reactive Communication Demonstration ===\n');

  console.log('1. Basic EventEmitter with multiple listeners:');
  const emitter = new ReactiveEventEmitter();
  
  const unsubscribe1 = emitter.subscribe('test', (data) => {
    console.log('Listener 1:', data);
  });
  
  const unsubscribe2 = emitter.subscribe('test', (data) => {
    console.log('Listener 2:', data.toUpperCase());
  });
  
  const unsubscribe3 = emitter.subscribe('test', (data) => {
    console.log('Listener 3: Length =', data.length);
  });
  
  emitter.emit('test', 'Hello World');
  
  console.log('\n2. Observable with reactive operators:');
  const numbers$ = Observable.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
  
  numbers$
    .filter(n => n % 2 === 0)
    .map(n => n * 2)
    .subscribe({
      next: value => console.log('Even doubled:', value),
      complete: () => console.log('Numbers stream completed')
    });
  
  console.log('\n3. Entity-to-entity communication:');
  const alice = new ChatUser('Alice');
  const bob = new ChatUser('Bob');
  const charlie = new ChatUser('Charlie');
  
  alice.connectTo(bob);
  alice.connectTo(charlie);
  bob.connectTo(charlie);
  
  alice.onStateChange(change => {
    console.log(`Alice state changed:`, change.changes);
  });
  
  bob.onStateChange(change => {
    console.log(`Bob state changed:`, change.changes);
  });
  
  alice.sendChatMessage('Bob', 'Hi Bob!');
  bob.sendChatMessage('Alice', 'Hello Alice!');
  alice.sendChatMessage('Charlie', 'Hey Charlie!');
  
  console.log('\n4. Game entities with reactive behavior:');
  const player1 = new GamePlayer('Warrior');
  const player2 = new GamePlayer('Mage');
  
  player1.connectTo(player2);

  player1.onStateChange(change => {
    if (change.changes.health !== undefined) {
      console.log(`${change.entity} health: ${change.newState.health}`);
    }
  });
  
  player2.onStateChange(change => {
    if (change.changes.health !== undefined) {
      console.log(`${change.entity} health: ${change.newState.health}`);
    }
  });
  
  player1.emitter.subscribe('playerDeath', (event) => {
    console.log(`💀 ${event.player} has died!`);
  });
  
  player2.emitter.subscribe('playerDeath', (event) => {
    console.log(`💀 ${event.player} has died!`);
  });
  
  player1.move(10, 20);
  player1.attack('Mage', 30);
  player2.attack('Warrior', 25);
  player1.attack('Mage', 40);
  player2.attack('Warrior', 50);
  player1.attack('Mage', 35); 
  
  console.log('\n5. Cleanup and unsubscribe:');
  unsubscribe1();
  unsubscribe2();
  console.log('Unsubscribed listeners 1 and 2');
  
  emitter.emit('test', 'Only listener 3 should respond');
  
  setTimeout(() => {
    alice.destroy();
    bob.destroy();
    charlie.destroy();
    player1.destroy();
    player2.destroy();
    console.log('All entities destroyed');
  }, 1000);
}

class EventEmitter {
    constructor() {
        this.events = {};
        this.id = Math.random().toString(36).substr(2, 9);
    }

    subscribe(eventName, callback) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }

        const subscriptionId = Math.random().toString(36).substr(2, 9);
        const subscription = { id: subscriptionId, callback };
        this.events[eventName].push(subscription);

        return () => this.unsubscribe(eventName, subscriptionId);
    }

    unsubscribe(eventName, subscriptionId) {
        if (this.events[eventName]) {
            this.events[eventName] = this.events[eventName].filter(
                sub => sub.id !== subscriptionId
            );
            if (this.events[eventName].length === 0) {
                delete this.events[eventName];
            }
        }
    }

    emit(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(subscription => {
                try {
                    subscription.callback(data);
                } catch (error) {
                    console.error(`Error in event handler for ${eventName}:`, error);
                }
            });
        }
    }

    getSubscriberCount(eventName) {
        return this.events[eventName] ? this.events[eventName].length : 0;
    }

    getAllEvents() {
        return Object.keys(this.events);
    }
}

const eventBus = new EventEmitter();

class ChatBot {
    constructor() {
        this.active = false;
        this.unsubscribers = [];
    }

    activate() {
        if (this.active) return;
        this.active = true;

        const unsub1 = eventBus.subscribe('chat:message', (data) => {
            if (data.sender !== 'ChatBot') {
                setTimeout(() => {
                    eventBus.emit('chat:message', {
                        sender: 'ChatBot',
                        message: `Bot response to: "${data.message}"`,
                        timestamp: new Date().toISOString()
                    });
                }, 1000);
            }
        });

        this.unsubscribers.push(unsub1);
        logToSystem('ChatBot activated');
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        logToSystem('ChatBot deactivated');
    }
}

class Moderator {
    constructor() {
        this.active = false;
        this.unsubscribers = [];
        this.bannedWords = ['spam', 'bad', 'toxic'];
    }

    activate() {
        if (this.active) return;
        this.active = true;

        const unsub1 = eventBus.subscribe('chat:message', (data) => {
            const hasBannedWord = this.bannedWords.some(word =>
                data.message.toLowerCase().includes(word)
            );

            if (hasBannedWord) {
                eventBus.emit('moderation:warning', {
                    message: `Warning: Message from ${data.sender} contains inappropriate content`,
                    originalMessage: data.message
                });
            }
        });

        this.unsubscribers.push(unsub1);
        logToSystem('Moderator activated');
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        logToSystem('Moderator deactivated');
    }
}

class InventorySystem {
    constructor() {
        this.active = false;
        this.unsubscribers = [];
        this.inventory = { items: 100 };
    }

    activate() {
        if (this.active) return;
        this.active = true;

        const unsub1 = eventBus.subscribe('ecommerce:addToCart', (data) => {
            this.inventory.items--;
            eventBus.emit('inventory:updated', {
                product: data.product,
                remaining: this.inventory.items
            });
        });

        const unsub2 = eventBus.subscribe('ecommerce:orderPlaced', (data) => {
            logToAnalytics(`Inventory: Order processed for ${data.items.length} items`);
        });

        this.unsubscribers.push(unsub1, unsub2);
        logToSystem('Inventory System activated');
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        logToSystem('Inventory System deactivated');
    }
}

class AnalyticsSystem {
    constructor() {
        this.active = false;
        this.unsubscribers = [];
        this.stats = { events: 0, revenue: 0 };
    }

    activate() {
        if (this.active) return;
        this.active = true;

        const events = ['ecommerce:addToCart', 'ecommerce:orderPlaced', 'chat:message', 'game:playerJoin'];

        events.forEach(eventName => {
            const unsub = eventBus.subscribe(eventName, (data) => {
                this.stats.events++;
                if (eventName === 'ecommerce:orderPlaced') {
                    this.stats.revenue += data.total || 0;
                }

                logToAnalytics(`Analytics: ${eventName} tracked (Total events: ${this.stats.events}, Revenue: $${this.stats.revenue.toFixed(2)})`);
            });
            this.unsubscribers.push(unsub);
        });

        logToSystem('Analytics System activated');
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        logToSystem('Analytics System deactivated');
    }
}

class GameUI {
    constructor() {
        this.active = false;
        this.unsubscribers = [];
    }

    activate() {
        if (this.active) return;
        this.active = true;

        const unsub1 = eventBus.subscribe('game:playerJoin', (data) => {
            logToSystem(`UI: Player ${data.playerId} joined the game`);
        });

        const unsub2 = eventBus.subscribe('game:playerMove', (data) => {
            logToSystem(`UI: Player moved to ${data.position.x}, ${data.position.y}`);
        });

        const unsub3 = eventBus.subscribe('game:playerAttack', (data) => {
            logToSystem(`UI: Player attacked with ${data.damage} damage`);
        });

        this.unsubscribers.push(unsub1, unsub2, unsub3);
        logToSystem('Game UI activated');
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        logToSystem('Game UI deactivated');
    }
}

class SoundSystem {
    constructor() {
        this.active = false;
        this.unsubscribers = [];
    }

    activate() {
        if (this.active) return;
        this.active = true;

        const unsub1 = eventBus.subscribe('game:playerJoin', () => {
            logToAnalytics('Sound: Player join sound played');
        });

        const unsub2 = eventBus.subscribe('game:playerAttack', () => {
            logToAnalytics('Sound: Attack sound effect played');
        });

        const unsub3 = eventBus.subscribe('ecommerce:addToCart', () => {
            logToAnalytics('Sound: Cart add chime played');
        });

        this.unsubscribers.push(unsub1, unsub2, unsub3);
        logToSystem('Sound System activated');
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        logToSystem('Sound System deactivated');
    }
}

const chatBot = new ChatBot();
const moderator = new Moderator();
const inventorySystem = new InventorySystem();
const analyticsSystem = new AnalyticsSystem();
const gameUI = new GameUI();
const soundSystem = new SoundSystem();

function logToSystem(message) {
    const output = document.getElementById('systemOutput');
    const div = document.createElement('div');
    div.innerHTML = `${new Date().toLocaleTimeString()}: ${message}`;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
}

function logToAnalytics(message) {
    const output = document.getElementById('analyticsOutput');
    const div = document.createElement('div');
    div.innerHTML = `${new Date().toLocaleTimeString()}: ${message}`;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
}

function updateSubscribersStatus() {
    const status = document.getElementById('subscribersStatus');
    const events = eventBus.getAllEvents();

    if (events.length === 0) {
        status.innerHTML = '<p>No active subscriptions</p>';
        return;
    }

    let html = '<div class="subscribers-grid">';
    events.forEach(eventName => {
        const count = eventBus.getSubscriberCount(eventName);
        html += `<div class="subscriber-item">
            <strong>${eventName}:</strong> ${count} subscriber${count !== 1 ? 's' : ''}
        </div>`;
    });
    html += '</div>';
    status.innerHTML = html;
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (message) {
        eventBus.emit('chat:message', {
            sender: 'User',
            message: message,
            timestamp: new Date().toISOString()
        });
        input.value = '';
    }
}

function addToCart() {
    const productInput = document.getElementById('productInput');
    const priceInput = document.getElementById('priceInput');

    const product = productInput.value.trim() || 'Sample Product';
    const price = parseFloat(priceInput.value) || 29.99;

    eventBus.emit('ecommerce:addToCart', {
        product: product,
        price: price,
        timestamp: new Date().toISOString()
    });

    productInput.value = '';
    priceInput.value = '';
}

function makeOrder() {
    eventBus.emit('ecommerce:orderPlaced', {
        items: ['Product 1', 'Product 2'],
        total: 59.98,
        timestamp: new Date().toISOString()
    });
}

function playerJoin() {
    eventBus.emit('game:playerJoin', {
        playerId: `Player${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString()
    });
}

function playerMove() {
    eventBus.emit('game:playerMove', {
        position: {
            x: Math.floor(Math.random() * 100),
            y: Math.floor(Math.random() * 100)
        },
        timestamp: new Date().toISOString()
    });
}

function playerAttack() {
    eventBus.emit('game:playerAttack', {
        damage: Math.floor(Math.random() * 50) + 10,
        timestamp: new Date().toISOString()
    });
}

function toggleChatBot() {
    chatBot.active ? chatBot.deactivate() : chatBot.activate();
    updateSubscribersStatus();
}

function toggleModerator() {
    moderator.active ? moderator.deactivate() : moderator.activate();
    updateSubscribersStatus();
}

function toggleInventory() {
    inventorySystem.active ? inventorySystem.deactivate() : inventorySystem.activate();
    updateSubscribersStatus();
}

function toggleAnalytics() {
    analyticsSystem.active ? analyticsSystem.deactivate() : analyticsSystem.activate();
    updateSubscribersStatus();
}

function toggleGameUI() {
    gameUI.active ? gameUI.deactivate() : gameUI.activate();
    updateSubscribersStatus();
}

function toggleSoundSystem() {
    soundSystem.active ? soundSystem.deactivate() : soundSystem.activate();
    updateSubscribersStatus();
}

document.addEventListener('DOMContentLoaded', function () {
    eventBus.subscribe('chat:message', (data) => {
        const chatOutput = document.getElementById('chatOutput');
        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = `<strong>${data.sender}:</strong> ${data.message} <small>(${new Date(data.timestamp).toLocaleTimeString()})</small>`;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    });

    eventBus.subscribe('moderation:warning', (data) => {
        logToSystem(`${data.message}`);
    });

    eventBus.subscribe('inventory:updated', (data) => {
        logToSystem(`Inventory: ${data.remaining} items remaining for ${data.product}`);
    });

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }

    updateSubscribersStatus();
    setInterval(updateSubscribersStatus, 2000);

    logToSystem('Reactive Communication System initialized');
    logToSystem('Toggle systems on/off to see reactive communication in action');
});

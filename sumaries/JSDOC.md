# JSDoc Documentation Guide

## 📚 Tổng quan

Project này đã được bổ sung **JSDoc** đầy đủ cho toàn bộ source code, bao gồm:
- ✅ Classes và Constructors
- ✅ Methods và Functions
- ✅ Parameters và Return types
- ✅ Examples và Usage
- ✅ Event emitters (@fires)
- ✅ Type definitions

## 🚀 Cài đặt JSDoc

```bash
npm install --save-dev jsdoc
```

## 📖 Generate Documentation

### Tạo HTML documentation
```bash
npx jsdoc -c jsdoc.json
```

Documentation sẽ được tạo trong thư mục `docs/`

### Xem documentation
```bash
# Mở file docs/index.html trong browser
# Hoặc dùng local web server:
npx http-server docs/ -p 8080
```

## 📝 JSDoc Tags được sử dụng

### Class Documentation
```javascript
/**
 * Mô tả class
 * @class
 */
class MyClass {
  /**
   * Mô tả constructor
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Logger} deps.logger - Logger instance
   */
  constructor({ logger }) {
    this.logger = logger;
  }
}
```

### Method Documentation
```javascript
/**
 * Mô tả method
 * @async
 * @param {string} id - Parameter description
 * @param {Object} [options] - Optional parameter
 * @returns {Promise<Object>} Return description
 * @returns {boolean} return.success - Success flag
 * @throws {Error} Khi nào throw error
 * @example
 * await myMethod("123", { opt: true });
 */
async myMethod(id, options) {
  // ...
}
```

### Function Documentation
```javascript
/**
 * Mô tả function
 * @param {string} path - File path
 * @param {*} defaultValue - Default value
 * @returns {Object|null} Parsed object hoặc null
 */
function readJson(path, defaultValue) {
  // ...
}
```

### Event Emitters
```javascript
/**
 * @class
 * @extends EventEmitter
 * @fires MyClass#dataReceived
 * @fires MyClass#error
 */
class MyClass extends EventEmitter {
  /**
   * Process data
   * @fires MyClass#dataReceived
   */
  process() {
    this.emit('dataReceived', data);
  }
}
```

### Module Documentation
```javascript
/**
 * Utility functions cho tag management
 * @module utils/tag
 */
```

## 🔍 IDE Integration

### VS Code

JSDoc sẽ tự động được VS Code nhận diện và hiển thị:
- **IntelliSense**: Autocomplete với type hints
- **Parameter Info**: Hiển thị parameters khi gõ function
- **Quick Info**: Hover để xem documentation
- **Go to Definition**: F12 để jump đến definition

### WebStorm / IntelliJ IDEA

Tương tự, JetBrains IDEs sẽ tự động parse JSDoc và cung cấp:
- Type checking
- Auto-completion
- Documentation popup

## 📂 Cấu trúc Documentation

Toàn bộ source code đã được document theo cấu trúc:

```
src/
├── controllers/       # API Controllers
│   ├── JobController.js
│   ├── QueueController.js
│   ├── ConfigController.js
│   └── ...
├── services/         # Business Logic Services
│   ├── JobService.js
│   ├── QueueService.js
│   ├── BuildService.js
│   ├── GitService.js
│   └── ...
└── utils/           # Utility Functions
    ├── exec.js      # Command execution
    ├── file.js      # File I/O
    ├── logger.js    # SSE Logger
    └── tag.js       # Tag versioning
```

## 💡 Best Practices

### 1. Luôn document public methods
```javascript
/**
 * Public method - phải có JSDoc
 */
publicMethod() {}
```

### 2. Private methods dùng @private
```javascript
/**
 * Internal method
 * @private
 */
_internalMethod() {}
```

### 3. Type definitions rõ ràng
```javascript
/**
 * @param {Object} config - Configuration object
 * @param {string} config.name - Name field
 * @param {number} config.timeout - Timeout in ms
 * @param {Array<string>} config.tags - List of tags
 */
```

### 4. Async methods cần @async
```javascript
/**
 * @async
 * @returns {Promise<Object>}
 */
async fetchData() {}
```

### 5. Sử dụng @example cho complex methods
```javascript
/**
 * @example
 * const result = await service.build({
 *   id: "123",
 *   options: { force: true }
 * });
 */
```

## 🔗 Useful Links

- [JSDoc Official](https://jsdoc.app/)
- [JSDoc Tags](https://jsdoc.app/#block-tags)
- [TypeScript JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)

## 📊 Coverage

Toàn bộ files đã được document:

### Controllers (11 files)
- ✅ JobController.js
- ✅ QueueController.js
- ✅ ConfigController.js
- ✅ SchedulerController.js
- ✅ BuildsController.js
- ✅ GitController.js
- ✅ DockerController.js
- ✅ DeployController.js
- ✅ EmailController.js
- ✅ WebhookController.js
- ✅ PullController.js

### Services (9 files)
- ✅ JobService.js
- ✅ JobScheduler.js
- ✅ QueueService.js
- ✅ BuildService.js
- ✅ ConfigService.js
- ✅ GitService.js
- ✅ DockerService.js
- ✅ EmailService.js
- ✅ Scheduler.js

### Utils (4 files)
- ✅ exec.js
- ✅ file.js
- ✅ logger.js
- ✅ tag.js

### Entry Point
- ✅ app.js

**Total: 25 files documented** ✨

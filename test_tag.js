const { nextTag, nextTagWithConfig, parseTag, createTagConfigFromCurrent } = require('./utils/tag');

console.log('=== TEST HỆ THỐNG TAG MỚI ===\n');

// Test 1: Kiểm tra nextTag cũ vẫn hoạt động
console.log('1. Test nextTag cũ:');
console.log('nextTag("1.0.75") =>', nextTag("1.0.75"));
console.log('nextTag("v2.3.10") =>', nextTag("v2.3.10"));
console.log('nextTag("latest") =>', nextTag("latest"));
console.log();

// Test 2: Kiểm tra parseTag
console.log('2. Test parseTag:');
console.log('parseTag("1.0.75-DAIHY-BETA") =>', parseTag("1.0.75-DAIHY-BETA"));
console.log('parseTag("v2.3.10-RELEASE") =>', parseTag("v2.3.10-RELEASE"));
console.log('parseTag("1.0.05") =>', parseTag("1.0.05"));
console.log('parseTag("latest") =>', parseTag("latest"));
console.log();

// Test 3: Kiểm tra nextTagWithConfig
console.log('3. Test nextTagWithConfig:');
const config1 = {
  prefix: '1.0',
  suffix: 'DAIHY-BETA',
  startVersion: 1,
  versionWidth: 2
};

console.log('Config:', config1);
console.log('nextTagWithConfig("1.0.75-DAIHY-BETA", config) =>', nextTagWithConfig("1.0.75-DAIHY-BETA", config1));
console.log('nextTagWithConfig("1.0.05-DAIHY-BETA", config) =>', nextTagWithConfig("1.0.05-DAIHY-BETA", config1));
console.log('nextTagWithConfig("latest", config) =>', nextTagWithConfig("latest", config1));
console.log();

// Test 4: Kiểm tra với config khác
console.log('4. Test với config khác:');
const config2 = {
  prefix: 'v2.3',
  suffix: 'RELEASE',
  startVersion: 10,
  versionWidth: 3
};

console.log('Config:', config2);
console.log('nextTagWithConfig("v2.3.010-RELEASE", config) =>', nextTagWithConfig("v2.3.010-RELEASE", config2));
console.log('nextTagWithConfig("v2.3.999-RELEASE", config) =>', nextTagWithConfig("v2.3.999-RELEASE", config2));
console.log();

// Test 5: Kiểm tra createTagConfigFromCurrent
console.log('5. Test createTagConfigFromCurrent:');
console.log('createTagConfigFromCurrent("1.0.75-DAIHY-BETA") =>', createTagConfigFromCurrent("1.0.75-DAIHY-BETA"));
console.log('createTagConfigFromCurrent("v2.3.010-RELEASE") =>', createTagConfigFromCurrent("v2.3.010-RELEASE"));
console.log('createTagConfigFromCurrent("1.0.05") =>', createTagConfigFromCurrent("1.0.05"));
console.log();

console.log('=== KẾT THÚC TEST ===');
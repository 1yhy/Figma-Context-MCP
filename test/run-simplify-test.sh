#!/bin/bash

# 加载环境变量
source .env

# 打印当前配置
echo "测试配置:"
echo "- Figma API Key: ${FIGMA_API_KEY:0:4}****${FIGMA_API_KEY: -4}"
echo "- 测试文件 Key: $TEST_FIGMA_FILE_KEY"
echo "- 测试节点 ID: $TEST_FIGMA_NODE_ID"
echo

# 运行简化测试
echo "=== 运行 Figma 数据简化测试 ==="
NODE_OPTIONS="--no-warnings" npx tsx test/test-simplify.ts

echo
echo "测试完成! 输出文件保存在 test-output 目录中"

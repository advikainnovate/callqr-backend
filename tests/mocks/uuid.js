// Mock for uuid module
const crypto = require('crypto');

const mockUUID = () => crypto.randomUUID();

module.exports = {
  v4: mockUUID,
  v1: mockUUID,
  v3: mockUUID,
  v5: mockUUID,
  NIL: '00000000-0000-0000-0000-000000000000',
  parse: (uuid) => uuid,
  stringify: (uuid) => uuid,
  version: (uuid) => 4,
  validate: (uuid) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
};

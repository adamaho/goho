// The published @adamaho/nopeus-* packages still declare engines.node ^24.
// Drop their Node engine range until nopeus releases Node 26 support, so
// engineStrict keeps applying to every other dependency.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name?.startsWith("@adamaho/nopeus-") && pkg.engines?.node) {
        delete pkg.engines.node;
      }
      return pkg;
    },
  },
};

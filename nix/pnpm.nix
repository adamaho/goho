{ lib, stdenv, fetchurl, autoPatchelfHook }:

let
  version = "12.3.4";
  artifacts = {
    aarch64-darwin = {
      platform = "darwin-arm64";
      hash = "sha512-PAyUol8T1+/+ViOiXAt51ECA+QnfXCqz6foL4bW+LsoX0NcVd5XVEM2mRQu+LV4oc7uRz9zf9U0P+XFfuQeDAw==";
    };
    x86_64-darwin = {
      platform = "darwin-x64";
      hash = "sha512-fxP9JCk0Cdye+ePuj+GJJLMUMTqHGWRdb1dtv4How876uQ2ehxvenpgiYAir/ceO9PsYUZkFTtyZdx+rRu5QOA==";
    };
    aarch64-linux = {
      platform = "linux-arm64";
      hash = "sha512-t71AVA7LRqiKTyZ5xMYaZc2n5DfdpMbfokZuiIOXHBOM03ECnF0t4iYwaBDqJgVjlKYUOwaF/bRQajGNA4cJ4w==";
    };
    x86_64-linux = {
      platform = "linux-x64";
      hash = "sha512-2ZqOlSPkfwX1h5cR+FPiWf8+F+2hZT/3TvhUK5sigHqwaQCIiq8R7CGxhndKs63JtcLi2a1Qpo+wX/EoyfjyJQ==";
    };
  };
  artifact = artifacts.${stdenv.hostPlatform.system};
in
stdenv.mkDerivation {
  pname = "pnpm";
  inherit version;

  src = fetchurl {
    url = "https://registry.npmjs.org/@pnpm/exe.${artifact.platform}/-/exe.${artifact.platform}-${version}.tgz";
    inherit (artifact) hash;
  };

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];
  dontConfigure = true;
  dontBuild = true;
  dontStrip = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 pnpm "$out/bin/pnpm"
    runHook postInstall
  '';

  meta = {
    description = "Fast, disk space efficient package manager";
    homepage = "https://pnpm.io";
    license = lib.licenses.mit;
    mainProgram = "pnpm";
    platforms = builtins.attrNames artifacts;
  };
}

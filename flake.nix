{
  description = "Development shell for Goho";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-darwin-x64.url = "github:NixOS/nixpkgs/nixpkgs-26.05-darwin";
  };

  outputs = { nixpkgs, nixpkgs-darwin-x64, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          nixpkgsForSystem =
            if system == "x86_64-darwin" then nixpkgs-darwin-x64 else nixpkgs;
          pkgs = import nixpkgsForSystem { inherit system; };
          pnpm12 = pkgs.callPackage ./nix/pnpm.nix { };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              docker
              docker-compose
              git
              nodejs_24
              pnpm12
            ];
          };
        });
    };
}

{
  description = "Development shell for Goho";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
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
          pkgs = import nixpkgs { inherit system; };
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

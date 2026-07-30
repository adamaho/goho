import { GoogleAuth, GoogleAuthConfig } from "@goho/lib-core";

export const GoogleAuthLive = GoogleAuth.serviceAccountLayerConfig(GoogleAuthConfig.serviceAccount);

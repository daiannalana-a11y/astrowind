import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.ical.monitoramentos",
  appName: "Monitoramentos",
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#0b6e7f", showSpinner: false }
  }
};

export default config;

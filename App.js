import React from 'react';
import {
  SafeAreaView,
  Text,
} from 'react-native';
import * as Device from 'expo-device';

import * as Sentry from '@sentry/react-native';

import BackgroundGeolocation from "react-native-background-geolocation";

Sentry.init({
  dsn: "https://9c7c2e67c26186ebe88339d35c9f3a26@o4506169033621504.ingest.us.sentry.io/4507059749781504",
})

function App() {
  const [location, setLocation] = React.useState('');

  React.useEffect(() => {
    /// 1.  Subscribe to events.
    const onLocation = BackgroundGeolocation.onLocation((location) => {
      console.log('[onLocation]', location);
      setLocation(JSON.stringify(location, null, 2));
    })

    const onMotionChange = BackgroundGeolocation.onMotionChange((event) => {
      console.log('[onMotionChange]', event);
    });

    const onActivityChange = BackgroundGeolocation.onActivityChange((event) => {
      console.log('[onActivityChange]', event);
    })

    const onProviderChange = BackgroundGeolocation.onProviderChange((event) => {
      console.log('[onProviderChange]', event);
    })

    let backendUrl = process.env.EXPO_PUBLIC_API_URL
    let debug = false

    if (!Device.isDevice) {
      backendUrl = 'http://localhost:3000'
      debug = true
    }

    /// 2. ready the plugin.
    BackgroundGeolocation.ready({
      // Geolocation Config
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter: 10,
      // Activity Recognition
      stopTimeout: 5,
      // Application config
      debug: debug, // <-- enable this hear sounds for background-geolocation life-cycle.
      logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
      stopOnTerminate: false,   // <-- Allow the background-service to continue tracking when user closes the app.
      startOnBoot: true,        // <-- Auto start tracking when device is powered-up.
      heartbeatInterval: 600,
      preventSuspend: true,
      // HTTP / SQLite config
      url: backendUrl + '/users/locations',
      batchSync: true,       // <-- [Default: false] Set true to sync locations to server in a single HTTP request.
    }).then((state) => {
      BackgroundGeolocation.start();
      console.log("- BackgroundGeolocation is configured and ready: ", state.enabled);
    });

    return () => {
      // Remove BackgroundGeolocation event-subscribers when the View is removed or refreshed
      // during development live-reload.  Without this, event-listeners will accumulate with
      // each refresh during live-reload.
      onLocation.remove();
      onMotionChange.remove();
      onActivityChange.remove();
      onProviderChange.remove();
    }
  }, []);


  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-blue">
      <Text>Click to enable BackgroundGeolocation</Text>
      <Text style={{fontFamily:'monospace', fontSize:12}}>{location}</Text>
    </SafeAreaView>
  )
}

export default Sentry.wrap(App)

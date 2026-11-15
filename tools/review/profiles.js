// Review scene: set up the profile list (as the browser's menu does) and add a second profile.
const { SelectableProfileService } = ChromeUtils.importESModule("resource:///modules/profiles/SelectableProfileService.sys.mjs");
await SelectableProfileService.maybeSetupDataStore();
if ((await SelectableProfileService.getProfileCount()) < 2) {
  await SelectableProfileService.createNewProfile(false);
}

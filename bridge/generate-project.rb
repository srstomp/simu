#!/usr/bin/env ruby
require 'xcodeproj'

project_path = 'SimuBridge.xcodeproj'
project = Xcodeproj::Project.new(project_path)

# Create main app target
app_target = project.new_target(:application, 'SimuBridge', :ios, '17.0')

# Create UI test target
ui_test_target = project.new_target(:ui_test_bundle, 'SimuBridgeUITests', :ios, '17.0')

# Add dependency: UI tests depend on app
ui_test_target.add_dependency(app_target)

# Get main group
main_group = project.main_group

# Create SimuBridge group and add files
app_group = main_group.new_group('SimuBridge')
app_files = [
  'SimuBridge/SimuBridgeApp.swift'
]

app_files.each do |file_path|
  file_ref = app_group.new_file(file_path)
  app_target.source_build_phase.add_file_reference(file_ref)
end

# Create SimuBridgeUITests group and add files
ui_test_group = main_group.new_group('SimuBridgeUITests')
ui_test_files = [
  'SimuBridgeUITests/HTTPServer.swift',
  'SimuBridgeUITests/AccessibilityService.swift',
  'SimuBridgeUITests/InteractionService.swift',
  'SimuBridgeUITests/Routes.swift',
  'SimuBridgeUITests/TestEntry.swift'
]

ui_test_files.each do |file_path|
  file_ref = ui_test_group.new_file(file_path)
  ui_test_target.source_build_phase.add_file_reference(file_ref)
end

# Add entitlements file reference (not to build phase, just reference)
entitlements_ref = ui_test_group.new_file('SimuBridgeUITests/SimuBridgeUITests.entitlements')

# Configure build settings for app target
app_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.simu.SimuBridge'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UILaunchScreen_Generation'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UISupportedInterfaceOrientations'] = 'UIInterfaceOrientationPortrait'
  config.build_settings['INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad'] = 'UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks'
  config.build_settings['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'YES'
  config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'YES'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
end

# Configure build settings for UI test target
ui_test_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.simu.SimuBridgeUITests'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'SimuBridgeUITests/SimuBridgeUITests.entitlements'
  config.build_settings['TEST_TARGET_NAME'] = 'SimuBridge'
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @loader_path/Frameworks'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
end

# Save the project
project.save

# Create shared scheme for the app target
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app_target)
scheme.set_launch_target(app_target)
scheme.add_test_target(ui_test_target)

schemes_dir = "#{project_path}/xcshareddata/xcschemes"
FileUtils.mkdir_p(schemes_dir)
scheme_path = "#{schemes_dir}/SimuBridge.xcscheme"
scheme.save_as(project_path, 'SimuBridge')

puts "Generated #{project_path} with SimuBridge scheme"

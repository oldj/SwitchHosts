//
//  App.h
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Command.h"


@protocol AppExports <JSExport>

- (void) terminate;
- (void) activate;
- (void) hide;
- (void) unhide;
- (void) beep;
- (void) bounce;
- (void) notify:(NSDictionary*)aNotification;
- (void) closeNotification:(NSString*)notificationId;

JSExportAs(setUserAgent, - (void) setCustomUserAgent:(NSString *)userAgentString);
- (void) openURL:(NSString*)url;
- (void) launch:(NSString *)name;
@property (readonly) NSNumber* idleTime;
@property (readonly) NSString* applicationPath;
@property (readonly) NSString* resourcePath;
@property (readonly) NSString* documentsPath;
@property (readonly) NSString* libraryPath;
@property (readonly) NSString* homePath;
@property (readonly) NSString* tempPath;
@property (readonly) NSArray* droppedFiles;
@property (readonly) NSMutableArray* notifications;
@end

@interface App : Command <AppExports>

- (id) initWithWebView:(WebView *)view;
- (void) addFiles: (NSArray*) files;
@end

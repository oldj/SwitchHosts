//
//  App.m
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "App.h"
#import "Event.h"

@interface App ()
@property (readwrite) NSString* applicationPath;
@property (readwrite) NSString* resourcePath;
@property (readwrite) NSString* documentsPath;
@property (readwrite) NSString* libraryPath;
@property (readwrite) NSString* homePath;
@property (readwrite) NSString* tempPath;
@property (readwrite) NSArray* droppedFiles;
@property (readwrite) NSMutableArray* notifications;
@end

@implementation App

@synthesize webView, applicationPath, resourcePath, libraryPath, homePath, tempPath, idleTime;

- (id) initWithWebView:(WebView *) view{
    self = [super init];
    
    if (self) {
        NSArray *docPaths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
        NSArray *libPaths = NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES);
        self.webView = view;
        self.applicationPath = [[NSBundle mainBundle] bundlePath];
        self.resourcePath = [[NSBundle mainBundle] resourcePath];
        self.documentsPath = [docPaths objectAtIndex:0];
        self.libraryPath = [libPaths objectAtIndex:0];
        self.homePath = NSHomeDirectory();
        self.tempPath = NSTemporaryDirectory();
        self.droppedFiles = nil;
        self.notifications = [NSMutableArray arrayWithCapacity: 2];
        
        [[[NSWorkspace sharedWorkspace] notificationCenter] addObserver: self
                                                               selector: @selector(receiveSleepNotification:)
                                                                   name: NSWorkspaceWillSleepNotification object: NULL];
        [[[NSWorkspace sharedWorkspace] notificationCenter] addObserver: self
                                                               selector: @selector(receiveWakeNotification:)
                                                                   name: NSWorkspaceDidWakeNotification object: NULL];
        [[[NSWorkspace sharedWorkspace] notificationCenter] addObserver: self
                                                               selector: @selector(receiveActivateNotification:)
                                                                   name: NSWorkspaceDidActivateApplicationNotification object: NULL];
    }
    
    return self;
}

- (void) terminate {
    [NSApp terminate:nil];
}

- (void) activate {
    [NSApp activateIgnoringOtherApps:YES];
}

- (void) hide {
    [NSApp hide:nil];
}

- (void) unhide {
    [NSApp unhide:nil];
}

- (void)beep {
    NSBeep();
}

- (void) bounce {
    [NSApp requestUserAttention:NSInformationalRequest];
}

- (void) addFiles: (NSArray*) files
{
    self.droppedFiles = files;
}
- (void)setCustomUserAgent:(NSString *)userAgentString {
    [self.webView setCustomUserAgent: userAgentString];
}

- (void) openURL:(NSString*)url {
    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:url]];
}

- (void) launch:(NSString *)name {
    [[NSWorkspace sharedWorkspace] launchApplication:name];
}

- (void)receiveSleepNotification:(NSNotification*)note{
    [Event triggerEvent:@"sleep" forWebView:self.webView];
}

- (void) receiveWakeNotification:(NSNotification*)note{
    [Event triggerEvent:@"wake" forWebView:self.webView];
}

- (void) receiveActivateNotification:(NSNotification*)notification{
    NSDictionary* userInfo = [notification userInfo];
    NSRunningApplication* runningApplication = [userInfo objectForKey:NSWorkspaceApplicationKey];
    if (runningApplication) {
        NSMutableDictionary* applicationDidGetFocusDict = [[NSMutableDictionary alloc] initWithCapacity:2];
        [applicationDidGetFocusDict setObject:runningApplication.localizedName
                                       forKey:@"localizedName"];
        [applicationDidGetFocusDict setObject:[runningApplication.bundleURL absoluteString]
                                       forKey:@"bundleURL"];
        
        [Event triggerEvent:@"appActivated" withArgs:applicationDidGetFocusDict forWebView:self.webView];
    }
}

- (void) notify:(NSDictionary*)aNotification {
    NSString* type = [aNotification valueForKey:@"type"];
    NSString* uid = [aNotification valueForKey:@"id"];

    if([type isEqualToString:@"sheet"]) {
        NSAlert *alert = [[NSAlert alloc] init];
        [alert setMessageText:[aNotification valueForKey:@"title"]];
        [alert setInformativeText:[aNotification valueForKey:@"content"]];
        [alert beginSheetModalForWindow:[[NSApplication sharedApplication] mainWindow]
                          modalDelegate:self
                         didEndSelector:nil
                            contextInfo:nil];
        
        
    } else {
        NSUserNotification *notification = [[NSUserNotification alloc] init];
        
        if(!uid) {
            uid =[[NSUUID UUID] UUIDString];
            
        }
        
        [notification setTitle:[aNotification valueForKey:@"title"]];
        [notification setInformativeText:[aNotification valueForKey:@"content"]];
        [notification setSubtitle:[aNotification valueForKey:@"subtitle"]];
        [notification setUserInfo:@{ @"id" : uid }];
        
        if([[aNotification valueForKey:@"sound"] boolValue] == YES || ![aNotification valueForKey:@"sound"] ) {
            [notification setSoundName: NSUserNotificationDefaultSoundName];
        }
        [[NSUserNotificationCenter defaultUserNotificationCenter] deliverNotification:notification];
        
        [self.notifications addObject:@{ @"id" : uid, @"title" : [aNotification valueForKey: @"title"], @"sentOn" :[NSDate date] }];
        
    }
}

- (void) closeNotification:(NSString*)notificationId {
    NSUserNotificationCenter *center = [NSUserNotificationCenter defaultUserNotificationCenter];
    for(NSUserNotification * deliveredNote in center.deliveredNotifications) {
        if ([notificationId isEqualToString:@"*"] || [deliveredNote.userInfo[@"id"] isEqualToString:notificationId]) {
            [center removeDeliveredNotification: deliveredNote];
             //NSPredicate *predicate = [NSPredicate predicateWithFormat:@"id==%@", notificationId];
             NSUInteger noteIdx = [self.notifications indexOfObjectPassingTest: ^BOOL(NSDictionary* obj, NSUInteger idx, BOOL *stop) {
                                        return [[obj valueForKey:@"id"] isEqualToString:notificationId];
                                  }];
            if (noteIdx != NSNotFound)
                [self.notifications removeObjectAtIndex:noteIdx];
        }
    }
}

/*
 To get the elapsed time since the previous input event—keyboard, mouse, or tablet—specify kCGAnyInputEventType.
 */
- (NSNumber*) idleTime {
    CFTimeInterval timeSinceLastEvent = CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateHIDSystemState, kCGAnyInputEventType);
    
    return [NSNumber numberWithDouble:timeSinceLastEvent];
}


@end

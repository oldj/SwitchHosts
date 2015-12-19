//
//  Window.m
//  MG
//
//  Created by Tim Debo on 5/20/14.
//
//

#import "AppDelegate.h"
#import "Window.h"
#import "WindowController.h"
#import <WebKit/WebKit.h>
#import "Event.h"

@interface Window ()
{
    NSRect _oldRestoreFrame;
    NSSize _oldMaxSize;
}
    @property (nonatomic, retain) WindowController *windowController;
    @property (nonatomic, retain) WebView *webView;
    @property (readwrite) BOOL isMaximized;
    @property (readwrite) CGFloat x;
    @property (readwrite) CGFloat y;

- (void) registerEvents;
- (void) triggerEvent:(NSString*) event;
- (void) triggerEvent: (NSString*) event withArgs: (NSDictionary*) args;
- (void) windowResized:(NSNotification*)notification;
- (void) windowMinimized:(NSNotification*)notification;

@end

@implementation Window

@synthesize isMaximized, x, y;

- (Window*) initWithWindowController: (WindowController*)windowController andWebview: (WebView*) webView
{
    self = [super init];
    if(self) {
        self.windowController = windowController;
        self.webView = webView;
        self.x = [self getX];
        self.y = [self getY];
        self.isMaximized = NO;
        
        [self registerEvents];
    }
    return self;
}


- (CGFloat) getX {
    NSRect frame = [self.webView window].frame;
    return frame.origin.x;
}

- (CGFloat) getY {
    NSRect frame = [self.webView window].frame;
    return frame.origin.y;
}

- (void) open:(NSString *)url
{
    WindowController* newWindow = [[WindowController alloc] initWithURL: url];
    [newWindow showWindow: [NSApplication sharedApplication].delegate];
    [newWindow.window makeKeyWindow];
    [newWindow.window setReleasedWhenClosed:YES];
   // self.windowController = [[WindowController alloc] initWithURL:[properties valueForKey:@"url"]];
   // [self.windowController showWindow: [NSApplication sharedApplication].delegate];
   // [self.windowController.window makeKeyWindow];
}


// Reopen the first window that was opened.
- (void) reopenFirst
{
    AppDelegate *appDelegate = (AppDelegate *)[[NSApplication sharedApplication] delegate];
    [appDelegate.windowController.window makeKeyAndOrderFront: nil];
}

- (void) title: (NSString*) title
{
   [self.windowController.window setTitle:title];
}

- (void) minimize {
    [self.windowController.window miniaturize:[NSApp mainWindow]];
}

- (void) toggleFullscreen {
    [self.windowController.window toggleFullScreen:[NSApp mainWindow]];
}

- (void) maximize {
    NSRect a = self.windowController.window.frame;
    _oldRestoreFrame = NSMakeRect(a.origin.x, a.origin.y, a.size.width, a.size.height);
   
    [self.windowController.window setFrame:[[NSScreen mainScreen] visibleFrame] display:YES];
}

- (void) move: (NSNumber*) xCoord y: (NSNumber*) yCoord
{
    NSRect frame = [self.webView window].frame;
    frame.origin.x = [xCoord integerValue];
    frame.origin.y = [yCoord integerValue];
    [self.windowController.window setFrame:frame display:YES];
}

- (void) resize: (NSNumber*) width height: (NSNumber*) height
{
    NSRect frame = [self.webView window].frame;
    frame.size.width = [width integerValue];
    frame.size.height = [height integerValue];
    [self.windowController.window setFrame:frame display:YES];
}

- (void) restore
{
    [self.windowController.window setFrame:_oldRestoreFrame display:YES];
}

- (void) registerEvents
{
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowResized:)
                                                 name:NSWindowDidResizeNotification
                                               object: self.windowController.window];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowRestored:)
                                                 name:NSWindowDidDeminiaturizeNotification
                                               object: self.windowController.window];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowMinimized:)
                                                 name:NSWindowDidMiniaturizeNotification
                                               object: self.windowController.window];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowEnterFullscreen:)
                                                 name:NSWindowDidEnterFullScreenNotification
                                               object: self.windowController.window];
    
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowWillEnterFullscreen:)
                                                 name:NSWindowWillEnterFullScreenNotification
                                               object: self.windowController.window];
    
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowExitFullscreen:)
                                                 name:NSWindowDidExitFullScreenNotification
                                               object: self.windowController.window];
    
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowClosed:)
                                                 name:NSWindowWillCloseNotification
                                               object: self.windowController.window];
}

- (void) windowClosed: (NSNotification*)notification
{
    self.webView = nil;
    self.windowController = nil;
}

- (void) windowResized:(NSNotification*)notification
{
	NSWindow* window = (NSWindow*)notification.object;
	NSSize size = [window frame].size;
	bool isFullScreen = (window.styleMask & NSFullScreenWindowMask) == NSFullScreenWindowMask;
    
    
    NSMutableDictionary* sizes = [NSMutableDictionary dictionaryWithCapacity:3];
    [sizes setObject: [NSNumber numberWithInt:size.width] forKey:@"width"];
    [sizes setObject: [NSNumber numberWithInt:size.height] forKey:@"height"];
    [sizes setObject: [NSNumber numberWithBool:isFullScreen] forKey:@"fullscreen"];
   
   
    [self triggerEvent:@"resize" withArgs:sizes];
}

- (void) windowMinimized:(NSNotification*)notification
{
    [self triggerEvent:@"minimized"];
}

- (void) windowRestored:(NSNotification*)notification
{
    [self triggerEvent:@"restore"];
}

- (void) windowWillEnterFullscreen:(NSNotification*)notification
{
    NSWindow* window = (NSWindow*)notification.object;
    _oldMaxSize = window.maxSize;
    [window setMaxSize: NSMakeSize(FLT_MAX, FLT_MAX)];
}

- (void) windowEnterFullscreen:(NSNotification*)notification
{
    [self triggerEvent:@"enter-fullscreen"];
}

- (void) windowExitFullscreen:(NSNotification*)notification
{
    NSWindow* window = (NSWindow*)notification.object;
    
    if(_oldMaxSize.width){
        [window setMaxSize:_oldMaxSize];
    }
    
    [self triggerEvent:@"leave-fullscreen"];
}

- (void) triggerEvent:(NSString *)event
{
    [self triggerEvent: event withArgs: nil];
}

- (void) triggerEvent: (NSString*) event withArgs: (NSDictionary*) args
{
    [Event triggerEvent: event withArgs: args forObject:@"window" forWebView:self.webView];
}


@end;

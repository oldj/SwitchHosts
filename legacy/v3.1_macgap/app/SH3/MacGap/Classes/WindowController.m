//
//  WindowController.m
//  MG
//
//  Created by Tim Debo on 5/19/14.
//
//

#import "WindowController.h"
#import "WebViewDelegate.h"
#import "JSON.h"

@interface WindowController ()

@property (nonatomic, readwrite, strong) NSMutableDictionary* settings;
@property (nonatomic, readwrite, strong) NSMutableDictionary* pluginObjects;
@property (nonatomic, readwrite, strong) NSArray* startupPluginNames;
@property (nonatomic, readwrite, strong) NSDictionary* pluginsMap;
@property (nonatomic, readwrite, assign) BOOL loadFromString;
@property (readwrite, assign) BOOL initialized;


-(void) setWindowParams;

@end

@interface WebPreferences (WebPreferencesPrivate)
- (void)_setLocalStorageDatabasePath:(NSString *)path;
- (void) setLocalStorageEnabled: (BOOL) localStorageEnabled;
- (void) setDatabasesEnabled:(BOOL)databasesEnabled;
- (void) setDeveloperExtrasEnabled:(BOOL)developerExtrasEnabled;
- (void) setWebGLEnabled:(BOOL)webGLEnabled;
- (void) setOfflineWebApplicationCacheEnabled:(BOOL)offlineWebApplicationCacheEnabled;
@end


@implementation WindowController

@synthesize webView, url, initialized, webViewDelegate, jsContext;


- (id)initWithWindow:(NSWindow *)aWindow
{
    self = [super initWithWindow:aWindow];
    if (self) {
      
    }
    return self;
}

- (void)windowDidLoad
{
    [super windowDidLoad];
 
    [self.webView setMainFrameURL:[self.url absoluteString]];
   
    
}

- (id) initWithURL:(NSString *) relativeURL{

    self = [super initWithWindowNibName:@"MainWindow"];
   
    
    self.url = [NSURL URLWithString:relativeURL relativeToURL:[[NSBundle mainBundle] resourceURL]];
    
    [self.window setFrameAutosaveName:@"MacGapWindow"];
    
    return self;
}

-(id) initWithRequest: (NSURLRequest *)request{
    self = [super initWithWindowNibName:@"MainWindow"];
  
    [[self.webView mainFrame] loadRequest:request];
    
    return self;
}


- (void) awakeFromNib
{
    WebPreferences *webPrefs = [WebPreferences standardPreferences];
   
    NSString *cappBundleName = [[[NSBundle mainBundle] infoDictionary] objectForKey:@"CFBundleName"];
    NSString *applicationSupportFile = [@"~/Library/Application Support/" stringByExpandingTildeInPath];
    NSString *savePath = [NSString pathWithComponents:[NSArray arrayWithObjects:applicationSupportFile, cappBundleName, @"LocalStorage", nil]];
 
    NSString *configPath = [[NSBundle mainBundle] pathForResource:@"./public/config" ofType:@"json"];
    NSMutableDictionary *config = [[[NSString alloc] initWithContentsOfFile:configPath encoding:NSUTF8StringEncoding error:NULL] JSONObject];
    
    NSDictionary *plugins = [config objectForKey:@"plugins"];
    self.pluginsMap = plugins;
    self.settings = config;
    
    [webPrefs _setLocalStorageDatabasePath:savePath];
    [webPrefs setLocalStorageEnabled:YES];
    [webPrefs setDatabasesEnabled:YES];
    [webPrefs setDeveloperExtrasEnabled:[[NSUserDefaults standardUserDefaults] boolForKey: @"developer"]];
    [webPrefs setOfflineWebApplicationCacheEnabled:YES];
    [webPrefs setWebGLEnabled:YES];
    
    [self.webView setPreferences:webPrefs];
    
    NSHTTPCookieStorage *cookieStorage = [NSHTTPCookieStorage
                                          sharedHTTPCookieStorage];
    [cookieStorage setCookieAcceptPolicy:NSHTTPCookieAcceptPolicyAlways];
    
    [self.webView setApplicationNameForUserAgent: @"MacGap"];
    
	self.webViewDelegate = [[WebViewDelegate alloc] initWithMenu:[NSApp mainMenu]];
    self.webViewDelegate.windowController = self;
    
	[self.webView setFrameLoadDelegate:self.webViewDelegate];
	[self.webView setUIDelegate:self.webViewDelegate];
	[self.webView setResourceLoadDelegate:self.webViewDelegate];
	[self.webView setDownloadDelegate:self.webViewDelegate];
	[self.webView setPolicyDelegate:self.webViewDelegate];
    [self.webView setDrawsBackground:NO];
    [self.webView setShouldCloseWithWindow:NO];
    [self.webView setGroupName:@"MacGap"];
    self.pluginObjects = [[NSMutableDictionary alloc] initWithCapacity:20];
    
    

}

- (void) setWindowParams
{
    NSDictionary* params = [self.settings objectForKey:@"window"];
  
    NSRect frame = [[self window] frame];
    
    if([params objectForKey:@"width"] != nil) {
        frame.size.width = [[params objectForKey:@"width"] doubleValue];
    }
    
    if([params objectForKey:@"height"]) {
        frame.size.height = [[params objectForKey:@"height"] doubleValue];
        
    }
    
    if([params objectForKey:@"min_width"] && [params objectForKey:@"min_height"]) {
        [self.window setMinSize: NSMakeSize( [[params objectForKey:@"min_width"] doubleValue], [[params objectForKey:@"min_height"] doubleValue] ) ];
    }
    
    if([params objectForKey:@"max_width"] && [params objectForKey:@"max_height"]) {
        [self.window setMaxSize: NSMakeSize( [[params objectForKey:@"max_width"] doubleValue], [[params objectForKey:@"max_height"] doubleValue] ) ];
    }
    
    
    if([params objectForKey:@"title"]) {
        [[self window] setTitle: [params objectForKey:@"title"]];
    }
    
    
    if([[params objectForKey:@"position"] isEqualToString:@"center"]) {
        [[self window] center];
    }
    
    if([params objectForKey:@"opaque"]) {
        [[self window] setOpaque: [[params objectForKey:@"opaque"] boolValue]];
    }
    
    if([params objectForKey:@"alpha"]) {
        NSColor *backgroundColor = [NSColor colorWithDeviceRed:0.0 green:0.0 blue:0.0 alpha:[[params objectForKey:@"alpha"] doubleValue]];
        [[self window] setBackgroundColor: backgroundColor];
    }
    
    [[self window] setFrame:frame display: YES];

  
}

#pragma mark -
#pragma mark Plugin Registration


- (void)registerPlugin:(Command*)plugin withClassName:(NSString*)className
{
    if ([plugin respondsToSelector:@selector(setWindowController:)]) {
        [plugin setWindowController:self];
    }
    
    
    [self.pluginObjects setObject:plugin forKey:className];
    [plugin initializePlugin];
}

- (void)registerPlugin:(Command*)plugin withPluginName:(NSString*)pluginName
{
    if ([plugin respondsToSelector:@selector(setWindowController:)]) {
        [plugin setWindowController:self];
    }
    
    
    NSString* className = NSStringFromClass([plugin class]);
    [self.pluginObjects setObject:plugin forKey:className];
    [self.pluginsMap setValue:className forKey:[pluginName lowercaseString]];
    [plugin initializePlugin];
}


- (id)getCommandInstance:(NSString*)pluginName
{
 
    NSString* className = [self.pluginsMap objectForKey:[pluginName lowercaseString]];
    if (className == nil) {
        className = [self.pluginsMap objectForKey:pluginName];
      
        if(className == nil)
            return nil;
    }
    
    id obj = [self.pluginObjects objectForKey:className];
    if (!obj) {
        obj = [[NSClassFromString(className)alloc] initWithWebView:webView];
        
        if (obj != nil) {
            [self registerPlugin:obj withClassName:className];
        } else {
            NSLog(@"Plugin class %@ (pluginName: %@) does not exist.", className, pluginName);
        }
    }
    return obj;
}



@end

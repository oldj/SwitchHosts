//
//  Defaults.m
//  MG
//
//  Created by Tim Debo on 6/1/14.
//
//

#import "Defaults.h"
#import "WindowController.h"
#import "Event.h"
#import "JSON.h"

typedef id (^ReturnType)();
typedef void (^SetType)();

@interface Defaults ()
- (NSString*) addPrefix:(NSString*)key;

@end

@implementation Defaults
@synthesize defaults;

- (id) initWithWindowController:(WindowController *)aWindowController
{
    self = [super init];
    if(self) {
        self.windowController = aWindowController;
        self.webView = aWindowController.webView;
 
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(defaultsChanged:)
                                                     name:NSUserDefaultsDidChangeNotification
                                                   object:nil];
        
    }
    
    return self;
    
}
- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver: self];
}

- (JSValue*) defaults
{
     return [JSValue valueWithObject: [self defaultsDictionary] inContext: [JSContext currentContext] ];
}

- (JSValue*) get:(NSString *)key ofType:(NSString *)type
{
    if(!key || [key isKindOfClass:[NSNull class]])
        return nil;
    
    if(!type || [type isKindOfClass:[NSNull class]]) {
        type = @"string";
    }
    
    NSUserDefaults *prefs = [NSUserDefaults standardUserDefaults];
    NSString* pfxKey = [self addPrefix:key];
    NSDictionary *types = @{
                            @"string" : ^{ return [prefs stringForKey:pfxKey];},
                            @"int" : ^{ return [NSNumber numberWithInteger:[prefs integerForKey:pfxKey]]; },
                            @"bool" : ^{ return [NSNumber numberWithBool:[prefs boolForKey:pfxKey]]; },
                            @"float" : ^{ return [NSNumber numberWithFloat:[prefs floatForKey:pfxKey]]; },
                            @"url" : ^{ return [[prefs URLForKey:pfxKey] absoluteString]; },
                            @"object" : ^{ return [prefs dictionaryForKey:pfxKey]; }
                            };
    id returnVal = nil;
    ReturnType theType = types[type];
  
    if(theType) {
        returnVal = theType();
    } else {
        //nil for now but we really should raise a JS Exception for this..
        return nil;
    }
    return [JSValue valueWithObject: returnVal inContext:[JSContext currentContext]];
}

- (void) setKey:(NSString*)key withValue: (JSValue*) value ofType: (NSString*) type
{
    if(!key || [key isKindOfClass:[NSNull class]])
        return;
    
    if(!type || [type isKindOfClass:[NSNull class]]) {
        type = @"string";
    }
    
    NSUserDefaults *prefs = [NSUserDefaults standardUserDefaults];
    NSString* pfxKey = [self addPrefix:key];
    
    NSDictionary *types = @{
                            @"string" : ^{ [prefs setObject: [value toString] forKey:pfxKey]; DebugNSLog(@"Set String: %@", value); },
                            @"int" : ^{  [prefs setInteger: [value toInt32] forKey:pfxKey]; DebugNSLog(@"Set int: %@",value);},
                            @"bool" : ^{  [prefs setBool: [value toBool] forKey:pfxKey]; DebugNSLog(@"Set bool: %@",value);},
                            @"float" : ^{  [prefs setFloat: [[value toNumber] floatValue] forKey:pfxKey]; DebugNSLog(@"Set float: %@",value);},
                            @"url" : ^{  [prefs setURL:[NSURL URLWithString: [value toString]] forKey:pfxKey]; DebugNSLog(@"Set url: %@",value);},
                           
                            };

    ((SetType) types[type])();
    
}

- (void) remove: (NSString*) key
{
    NSString* prefixedKey;
    prefixedKey = [self addPrefix:key];
    
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:prefixedKey];
    [[NSUserDefaults standardUserDefaults] synchronize];
}

// Check we have a standard prefix for JS-modified keys, for security purposes.
// If not, add it. This stops JavaScript from ever being able to modify keys
// it did not create.
- (NSString*) addPrefix:(NSString*)key {
    NSString* prefix;
    prefix = [kWebScriptNamespace stringByAppendingString:@"_"];
    
    if (![key hasPrefix:prefix]) {
        key = [prefix stringByAppendingString:key];
    }
    return key;
}

- (void)defaultsChanged:(NSNotification *)notification {
    NSDictionary* returnDict = [self defaultsDictionary];
    [Event triggerEvent:@"userDefaultsChanged" withArgs:returnDict forWebView:self.webView];
}

- (NSDictionary*) defaultsDictionary {
    NSString* prefix = [kWebScriptNamespace stringByAppendingString:@"_"];
    NSMutableDictionary* returnDict = [[NSMutableDictionary alloc] init];
    
    // Get the user defaults.
    NSUserDefaults *defs = [NSUserDefaults standardUserDefaults];
    [[defs dictionaryRepresentation] enumerateKeysAndObjectsUsingBlock:^( id key, id val, BOOL *stop) {
        if([key hasPrefix: prefix]) {
            [returnDict setObject: val forKey: key];
        }
    }];
     
    return returnDict;
}

@end

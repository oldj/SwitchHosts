//
//  Sound.m
//  MG
//
//  Created by Tim Debo on 5/31/14.
//
//

#import "Sound.h"
#import <WebKit/WebKit.h>
#import "WindowController.h"

@interface Sound ()
{
    NSMutableDictionary * callbacks;
}
@property (readwrite) JSContext* context;
@end

@implementation Sound
@synthesize cb, context;

- (id) initWithWindowController:(WindowController *)aWindowController
{
    self = [super init];
    if(self) {
        self.windowController = aWindowController;
        self.webView = aWindowController.webView;
    }
    callbacks = [NSMutableDictionary new];
    return self;
    
}

- (void) playSound:(NSSound*)sound onComplete:(JSValue*)callback {
    if (callback && ![callback isKindOfClass:[NSNull class]]) {
        //cb = callback;
        [callbacks setObject:callback forKey:[sound name]];
        context = [JSContext currentContext];
        [sound setDelegate:self];
    }
    [sound play];
}

- (void) play:(NSString*)file onComplete:(JSValue*)callback {
	NSURL* fileUrl  = [NSURL fileURLWithPath:pathForResource(file)];
	DebugNSLog(@"Sound file:%@", [fileUrl description]);
	
	NSSound* sound = [[NSSound alloc] initWithContentsOfURL:fileUrl byReference:YES];
    if(!sound.name) {
        sound.name = fileUrl.lastPathComponent;
    }
    
    NSLog(@"Callback: %@, Sound: %@, Name: %@", callback, sound, [sound name]);
    [self playSound:sound onComplete:callback];
}

- (void) playSystem:(NSString*)name onComplete:(JSValue*)callback {
    NSSound *systemSound = [NSSound soundNamed:name];
    [self playSound:systemSound onComplete:callback];
}

- (void)sound:(NSSound *)aSound didFinishPlaying:(BOOL)finishedPlaying {
    cb = [callbacks valueForKey:[aSound name]];
    [cb callWithArguments:@[aSound.name]];
    cb = nil;
}

@end

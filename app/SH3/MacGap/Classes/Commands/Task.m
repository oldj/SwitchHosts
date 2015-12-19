//
//  Task.m
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Task.h"
#import "WindowController.h"

@interface Task ()
@property (readwrite) BOOL isRunning;
@property (readwrite) BOOL launched;
@end

@implementation Task

@synthesize task, callback, isRunning,waitUntilExit,environment, arguments, pipeOutput, currentDirectoryPath;

- (id) initWithWindowController:(WindowController *)aWindowController
{
    self = [super init];
    if(self) {
        self.windowController = aWindowController;
        self.webView = aWindowController.webView;
        self.isRunning = NO;
        self.launched = NO;
        self.waitUntilExit = YES;
        self.arguments = nil;
        self.environment = nil;
        self.callback = nil;
        self.pipeOutput = NO;
        
    }
    
    return self;
    
}

- (JSValue*) createTask: (NSString*) path withCallback: (JSValue*) aCallback
{
    task = [[NSTask alloc] init];
    if(aCallback && ![aCallback isKindOfClass:[NSNull class]]) {
        callback = [JSManagedValue managedValueWithValue:aCallback];
        [[[JSContext currentContext] virtualMachine] addManagedReference:callback withOwner:self];
    }
    task.launchPath = path;
    self.environment = task.environment;
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(taskDidTerminate:)
                                                 name:NSTaskDidTerminateNotification
                                               object:nil];

    return [JSValue valueWithObject:self inContext:[JSContext currentContext]];
}
- (void) taskDidTerminate: (NSNotification*)notification
{
  
    NSTask *aTask = notification.object;
    int status = [aTask terminationStatus];
    NSDictionary *result = nil;
  
    
    if(pipeOutput == YES) {
     
        NSData *data;
        data = [self.outFile readDataToEndOfFile];
        NSString *string;
        string = [[NSString alloc] initWithData: data
                                       encoding: NSUTF8StringEncoding];
        result = @{ @"status" : [NSNumber numberWithInt:status], @"stdOut" : string, @"stdIn" : aTask.standardInput, @"stdErr" : aTask.standardError };
    } else {
        result = @{ @"status" : [NSNumber numberWithInt:status], @"stdOut" : aTask.standardOutput, @"stdIn" : aTask.standardInput, @"stdErr" : aTask.standardError };
     
    }
    
    dispatch_sync(dispatch_get_main_queue(), ^{
           [callback.value callWithArguments:@[result]];
            task = nil;
            self.isRunning = NO;
            self.launched = NO;
            self.arguments = nil;
            self.environment = nil;
            self.callback = nil;
            self.outFile = nil;
            self.outputPipe = nil;
            self.pipeOutput = NO;
       });
   
}

- (void) setArguments:(NSArray *)args
{
    if(task) {
       task.arguments = args;
    }
}

- (void) setCurrentDirectoryPath:(NSString *)path
{
    
    if(task) {
        task.currentDirectoryPath = path;
    }
    
}

- (void) setPipeOutput:(BOOL)shouldPipe
{
   
    if(task) {
        if(shouldPipe == YES) {
            self.outputPipe = [NSPipe pipe];
            [task setStandardOutput: self.outputPipe];
            self.outFile = [self.outputPipe fileHandleForReading];
            pipeOutput = shouldPipe;
        }
    }
}

- (JSValue*) arguments
{
    if(task) {
        return [JSValue valueWithObject: task.arguments inContext: [JSContext currentContext] ];
    }
    return nil;
}

- (void) launch
{
    if(task && self.launched == NO) {
        
        //run task on background thread to prevent UI lockup
        dispatch_queue_t taskQueue = dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_BACKGROUND, 0);
        dispatch_async(taskQueue, ^{
            
           
            self.isRunning = YES;
          
            @try {
                
                [task launch];
                
                self.launched = YES;
                
                if(self.waitUntilExit)
                {
                    [task waitUntilExit];
                }
            }
          
            @catch (NSException *exception) {
                NSLog(@"Problem Running Task: %@", [exception description]);
            }
        
            @finally {
                self.isRunning = NO;
            }
        });
    }
    
}

- (void) terminate
{
    if(self.isRunning) {
        [task terminate];
    }
}

- (void) dealloc
{
    if(self.isRunning)
        [task terminate];
}

@end

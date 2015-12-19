//
//  Task.h
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Command.h"

@protocol TaskExports <JSExport>

JSExportAs(create, - (JSValue*) createTask: (NSString*) path withCallback: (JSValue*) aCallback);
- (void) launch;
- (void) terminate;

@property (readonly) BOOL isRunning;
@property (readwrite) BOOL waitUntilExit;
@property (readwrite) BOOL pipeOutput;
@property (readwrite) NSArray* arguments;
@property (readwrite) NSDictionary* environment;
@property (readwrite) NSString* currentDirectoryPath;
@property (strong) JSManagedValue* callback;
@end

@interface Task : Command <TaskExports>
@property (strong) NSTask* task;
@property (strong) NSPipe *outputPipe;
@property (strong) NSFileHandle *outFile;
@end

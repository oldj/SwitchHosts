//
//  Dialog.h
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import <Foundation/Foundation.h>
#import "Command.h"
#import <JavaScriptCore/JavaScriptCore.h>

@protocol DialogExports <JSExport>
- (void) openDialog:(JSValue *)args;
- (void) saveDialog: (JSValue*)args;
@end

@interface Dialog : Command <DialogExports>

@property (assign) JSContext* context;

@end

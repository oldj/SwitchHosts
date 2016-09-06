//
//  Defaults.h
//  MG
//
//  Created by Tim Debo on 6/1/14.
//
//

#import "Command.h"
@protocol DefaultExports <JSExport>
@property (readonly) NSDictionary* defaults;
JSExportAs(get, - (JSValue*) get: (NSString*) key ofType: (NSString*) type);
JSExportAs(set, - (void) setKey:(NSString*)key withValue: (JSValue*) value ofType: (NSString*) type);
- (void) remove: (NSString*) key;
@end

@interface Defaults : Command <DefaultExports>

- (void)defaultsChanged:(NSNotification *)notification;
- (NSDictionary*) defaultsDictionary;


@end

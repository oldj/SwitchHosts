//
//  StatusItem.h
//  MG
//
//  Created by Tim Debo on 5/28/14.
//
//

#import "Command.h"
@protocol StatusItemExports <JSExport>
JSExportAs(create, - (void) createItem: (NSDictionary*) props callback: (JSValue*) cb);
@property (readwrite) JSValue *menu;
@property (readwrite) NSString *title;
@end

@interface StatusItem : Command <StatusItemExports>
@property (nonatomic, retain) NSStatusItem *statusItem;
- (void) itemClicked: (id) sender;
@end

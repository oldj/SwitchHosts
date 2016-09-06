//
//  MenuItem.h
//  MG
//
//  Created by Tim Debo on 5/23/14.
//
//

#import <Foundation/Foundation.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import "Command.h"

@protocol MenuItemExports <JSExport>
- (void) remove;
//- (void) setCallback:(JSManagedValue*)aCallback;
- (void) setKey:(NSString*)keyCommand;
- (void) setLabel:(NSString*)label;
JSExportAs(addSubmenu, - (JSValue*)addSubmenu: (NSString*) aTitle);
@property (readonly) JSValue* submenu;
@property (readwrite) BOOL enabled;
@property (strong) JSValue* callback;
@end

@interface MenuItem : Command <MenuItemExports>
{
    NSMenuItem *item;
};
@property (nonatomic, strong) NSMenuItem *item;
+ (MenuItem*) menuItemWithContext: (JSContext*) context andMenu: (NSMenuItem*) aMenuItem;
- (id) initWithContext:(JSContext*)aContext andMenuItem:(NSMenuItem*)anItem;
@end

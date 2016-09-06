//
//  Menu.h
//  MG
//
//  Created by Tim Debo on 5/20/14.
//
//

#import "Command.h"
#import <JavaScriptCore/JavaScriptCore.h>
@protocol MenuExports <JSExport>

@property (readonly) NSString* type;
@property (readonly) NSArray* menuItems;

JSExportAs(create, - (JSValue*) create: (NSString*) title type: (NSString*) type);

JSExportAs(addItem, - (JSValue*) addItem: (NSDictionary*) props callback: (JSValue*) aCallback);

JSExportAs(getItem, - (JSValue*) itemForKey:(id)key);

- (JSValue*)addSeparator;

+ (NSString*)getKeyFromString:(NSString*)keyCommand;

@end;

@interface Menu : Command <MenuExports>
{
    NSMenu* menu;
}
@property (strong) NSMenu* menu;
@property (readonly) NSString* type;
@property (strong) JSContext* context;

+ (Menu*) menuWithContext: (JSContext*) context andMenu: (NSMenu*) aMenu;
- (Menu*) initWithMenu: (NSMenu*) aMenu forContext: (JSContext*) context;
- (Menu*) initWithMenu: (NSMenu*) aMenu andType: (NSString*) type forContext: (JSContext*) context;
- (NSMenu*)removeItem:(id)key;
@end

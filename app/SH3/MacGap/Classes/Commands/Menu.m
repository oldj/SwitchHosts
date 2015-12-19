//
//  Menu.m
//  MG
//
//  Created by Tim Debo on 5/20/14.
//
//
#import <objc/runtime.h>
#import "Menu.h"
#import "MenuItem.h"

static char REPRESENTED_OBJECT;

@interface NSMenu (represented)
@property (strong) id representedObject;
@end

@implementation NSMenu (represented)

- (id) representedObject
{
    return objc_getAssociatedObject(self, &REPRESENTED_OBJECT);
}

- (void) setRepresentedObject:(id)representedObject
{
    objc_setAssociatedObject(self,
                             &REPRESENTED_OBJECT,
                             representedObject,
                             OBJC_ASSOCIATION_RETAIN);
}

@end

@interface Menu ()
    @property (readwrite) NSString* type;
    @property (readwrite) NSArray* menuItems;
@end;

@implementation Menu

@synthesize menu;

+ (Menu*) menuWithContext: (JSContext*) context andMenu: (NSMenu*) aMenu
{
    Menu *ret = [aMenu representedObject];
    if (ret)
    {
        NSLog(@"MP cache hit");
        return ret;
    }
    return [[Menu alloc] initWithMenu:aMenu forContext:context];
}

- (Menu*) initWithMenu: (NSMenu*) aMenu forContext: (JSContext*) context{
    
    return [self initWithMenu: aMenu andType: nil forContext:context];
}

- (Menu*) initWithMenu: (NSMenu*) aMenu andType: (NSString*) type forContext: (JSContext*) aContext{
    self = [super initWithContext: aContext];
    if (self) {
        
        menu = aMenu;
        menu.representedObject = self;
        self.type = type;
        NSArray* items = aMenu.itemArray;
        NSMutableArray* itemsArr = nil;
        if(items)
        {
            itemsArr = [NSMutableArray arrayWithCapacity: items.count];
            for( NSMenuItem* item in items) {
                [itemsArr addObject: [MenuItem menuItemWithContext:aContext andMenu:item] ];
            }
            
        }
        self.menuItems = itemsArr;
        self.context = aContext;
        
    }
    return self;
}

- (JSValue*) create: (NSString*) title type: (NSString*) type
{
    NSMenu* newMenu = [[NSMenu alloc] initWithTitle:title];
    Menu* theMenu = [[Menu alloc] initWithMenu:newMenu forContext: [JSContext currentContext]];
    theMenu.type = type;
    
    return [JSValue valueWithObject:theMenu inContext:[JSContext currentContext]];
}

- (JSValue*) addItem: (NSDictionary*) props callback: (JSValue*) aCallback
{

    NSString* title = [props valueForKey: @"label"];
    NSString* cmds = [props valueForKey: @"keys"];
    NSNumber* index = [props valueForKey: @"index"];
    NSString *key = nil;
    NSMenuItem *item = nil;

    if (title == nil || [title isKindOfClass: [NSNull class]])
        title = @"";
    
    if (cmds != nil && ![cmds isKindOfClass: [NSNull class]]) {
        key = [Menu getKeyFromString:cmds];
    } else {
        key = @"";
    }
   
    if(index != nil && ![index isKindOfClass:[NSNull class]]) {
        item = [menu insertItemWithTitle:title action:nil keyEquivalent:key atIndex:[index integerValue] ];
    } else {
        item = [menu addItemWithTitle:title action:nil keyEquivalent:key ];
        
    }
    
    NSUInteger modifiers = [Menu getModifiersFromString:cmds];
    [item setKeyEquivalentModifierMask:modifiers];
    
    if(!menu.supermenu && ![_type isEqualToString:@"statusbar"]) {
        NSMenu *s = [[NSMenu alloc] initWithTitle: title];
        
        [item setSubmenu:s];
    }
    
    MenuItem* menuItem = [MenuItem menuItemWithContext:self.context andMenu:item];

    if(aCallback != nil && ![aCallback isKindOfClass: [NSNull class]]) {
    
        [menuItem setCallback:aCallback];
    
    }

    [menu setAutoenablesItems:NO]; 
    
    return [JSValue valueWithObject:menuItem inContext:self.context ];
    
}

- (JSValue*) addSeparator
{
    NSMenuItem *sep = [NSMenuItem separatorItem];
    [self.menu addItem:sep];
    return [JSValue valueWithObject: self inContext:JSContext.currentContext];

}

- (JSValue*)itemForKey:(id)key
{
    if (!key || [key isKindOfClass: [NSNull class]])
        return nil;
    
    NSMenuItem *item = nil;
    if ([key isKindOfClass:[NSNumber class]])
    {
        if([key intValue] >= [[menu itemArray] count]) {
            return nil;
        }
        
        item = [menu itemAtIndex:[key intValue]];
    }
    else if ([key isKindOfClass:[NSString class]])
    {
        item = [menu itemWithTitle:key];
        if (!item)
        {
            // Try again, with ... appended. e.g. "Save..."
            item = [menu itemWithTitle:
                    [key stringByAppendingString:@"\u2026"]];
        }
    }
    if (!item)
        return nil;
    
    MenuItem *mi = [MenuItem menuItemWithContext:self.context andMenu:item]; //[[MenuItem alloc] initWithContext:[JSContext currentContext] andMenuItem:item];
    
    return [JSValue valueWithObject: mi inContext: self.context];
}


+ (NSString*)getKeyFromString:(NSString*)keyCommand {
    if (keyCommand == nil || [keyCommand isKindOfClass: [NSNull class]])
        keyCommand = @"";
   
    // Obtain the key (if there are modifiers, it will be the last character).
    NSString *aKey = @"";
    if ([keyCommand length] > 0) {
        aKey = [keyCommand substringFromIndex:[keyCommand length] - 1];
    }
    
    return aKey;
}

+ (NSUInteger)getModifiersFromString:(NSString*)keyCommand {
  if (keyCommand == nil || [keyCommand isKindOfClass: [NSNull class]])
      return 0;
    // aKeys may optionally specify one or more modifiers.
    NSUInteger modifiers = 0;
    
    if ([keyCommand rangeOfString:@"caps"].location != NSNotFound) modifiers += NSAlphaShiftKeyMask;
    if ([keyCommand rangeOfString:@"shift"].location != NSNotFound) modifiers += NSShiftKeyMask;
    if ([keyCommand rangeOfString:@"cmd"].location != NSNotFound) modifiers += NSCommandKeyMask;
    if ([keyCommand rangeOfString:@"ctrl"].location != NSNotFound) modifiers += NSControlKeyMask;
    if ([keyCommand rangeOfString:@"opt"].location != NSNotFound) modifiers += NSAlternateKeyMask;
    if ([keyCommand rangeOfString:@"alt"].location != NSNotFound) modifiers += NSAlternateKeyMask;
    
    return modifiers;
}

- (NSMenu*)removeItem:(id)key
{
    if(key == nil || [key isKindOfClass: [NSNull class]]) {
        return nil;
    }
    
    NSMenuItem *item = nil;
   
    if ([key isKindOfClass:[NSNumber class]])
    {
        item = [menu itemAtIndex:[key intValue]];
    }
    else if ([key isKindOfClass:[NSString class]])
    {
        item = [menu itemWithTitle:key];
        if (!item)
        {
            // Try again, with ... appended. e.g. "Save..."
            item = [menu itemWithTitle:
                    [key stringByAppendingString:@"\u2026"]];
        }
    }
    if (!item)
        return nil;
    
    [menu removeItem:item];
    return menu;
}

- (void) dealloc
{
    NSLog(@"Menu Deallocated");
    menu.representedObject = nil;
}

@end

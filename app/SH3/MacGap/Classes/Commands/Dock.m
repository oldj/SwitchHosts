//
//  Dock.m
//  MG
//
//  Created by Tim Debo on 5/22/14.
//
//

#import "Dock.h"


@implementation Dock


- (JSValue*) badge
{
    NSDockTile *tile = [[NSApplication sharedApplication] dockTile];
    return [JSValue valueWithObject:[tile badgeLabel] inContext: JSContext.currentContext];
}

- (void) addBadge: (NSString*) badge
{
    NSDockTile *tile = [[NSApplication sharedApplication] dockTile];
    [tile setBadgeLabel:badge];
}

- (void) removeBadge
{
    NSDockTile *tile = [[NSApplication sharedApplication] dockTile];
    [tile setBadgeLabel:nil];
}

@end

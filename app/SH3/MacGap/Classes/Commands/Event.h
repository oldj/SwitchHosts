//
//  Event.h
//  MG
//
//  Created by Tim Debo on 5/23/14.
//
//

#import <Foundation/Foundation.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import "WindowController.h"

@interface Event : NSObject

//+ (void) triggerEvent:(NSString *)event forContext:(JSContext*) context;
//+ (void) triggerEvent:(NSString *)event withArgs:(NSDictionary *)args forContext:(JSContext*) context;
//+ (void) triggerEvent:(NSString *)event withArgs:(NSDictionary *)args forObject:(NSString *)objName forContext:(JSContext*) context;

+ (void) triggerEvent:(NSString *)event forWebView:(WebView *)webView;
+ (void) triggerEvent:(NSString *)event withArgs:(NSDictionary *)args forWebView:(WebView *)webView;
+ (void) triggerEvent:(NSString *)event withArgs:(NSDictionary *)args forObject:(NSString *)objName forWebView:(WebView *)webView;
+ (void) triggerDomEvent:(NSString *)event withArgs:(NSDictionary *)args forWebView:(WebView *)webView;

@end
